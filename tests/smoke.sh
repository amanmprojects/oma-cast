#!/bin/bash
# Live Phase 0 acceptance check against the running omarchy-shell.
# Needs the plugin installed (bin/oma-cast install). It shows and hides the
# launcher but never types, so nothing lands in other windows.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
cli=bin/oma-cast
fail=0
pass() { printf '  ok    %s\n' "$1"; }
bad() { printf '  FAIL  %s\n' "$1"; fail=1; }

echo "doctor"
$cli doctor | sed 's/^/  /' || fail=1

echo "ipc"
[[ $($cli call system.healthPing '{}') == '{"ok":true,"data":null}' ]] && pass "system.healthPing round trip" || bad "system.healthPing round trip"
[[ $($cli call foo.bar) == '{"ok":false,"error":"Unknown method foo.bar"}' ]] && pass "unknown methods are errors" || bad "unknown methods are errors"
$cli call settings.getGeneralSettings | grep -q '"popToRootTimeout"' && pass "settings document loaded" || bad "settings document loaded"

echo "root search (Phase 1)"
search() { $cli call rootSearch.search "{\"query\":\"$1\"}"; }
first() { search "$1" | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(d["data"][0]["rows"][0]["title"] if d["ok"] and d["data"] else "")'; }
[[ $(first nightlight) == "Nightlight" ]] && pass "Omarchy menu items are searchable (nightlight)" || bad "Omarchy menu items are searchable (nightlight)"
[[ $(first "") != "" ]] && pass "empty root has sections" || bad "empty root has sections"
search zzzz-no-match | grep -q '"id":"fallback-commands"' && pass "fallback section for unmatched queries" || bad "fallback section for unmatched queries"
count=$($cli call system.info | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["data"]["candidates"])')
(( count > 300 )) && pass "$count candidates (apps + Omarchy menu)" || bad "only $count candidates"

echo "calculator (Phase 2)"
calc() { $cli call calculator.calculate "{\"expression\":\"$1\"}"; }
calc '2+2' | grep -q '"formatted":"4"' && pass "2+2 = 4" || bad "2+2"
calc '5 km in mi' | grep -q '"formatted":"3.10685596119 mi"' && pass "5 km in mi" || bad "unit conversion"
calc '12 / 100000000000' | grep -q '"formatted":"1.2e-10"' && pass "scientific exponent preserved" || bad "scientific formatting"
calc '200 + 10% + 5' | grep -q '"formatted":"225"' && pass "chained percentages" || bad "percent parsing"
calc '42' | grep -q '"raw":42' && pass "explicit RPC accepts a single number" || bad "explicit calculator RPC"
calc '1 btc in usd' | grep -q '"ok":false' && pass "unsupported crypto is an error" || bad "invented crypto rate"
# No network or clipboard writes: compare against the backend's cached result.
currency=$(calc '100 usd in eur')
if [[ $currency == *'"ok":true'* ]]; then
  row=$(search '100 usd in eur')
  python3 -I -c '
import json,sys
result=json.loads(sys.argv[1])["data"]
row=json.loads(sys.argv[2])["data"][0]["rows"][0]
assert result["rateDate"] and result["rateSource"] == "ECB via Frankfurter"
assert row["result"] == result["formatted"] and row["rateDate"] == result["rateDate"]
' "$currency" "$row" && pass "currency row matches the dated cache" || bad "currency metadata"
else
  search '100 usd in eur' | grep -q '"disabled":true' && pass "missing rates cannot be copied" || bad "unavailable currency row"
fi

echo "toggle latency (show -> layer mapped, hide -> unmapped; budget 100 ms)"
sock="$XDG_RUNTIME_DIR/hypr/$HYPRLAND_INSTANCE_SIGNATURE/.socket2.sock"
events=$(mktemp)
socat -u "UNIX-CONNECT:$sock" - 2>/dev/null | while IFS= read -r line; do
  case $line in *layer\>\>oma-cast*) echo "$(date +%s%N) ${line%%>>*}" >>"$events" ;; esac
done &
watcher=$!
sleep 0.3
$cli hide
worst=0
for i in 1 2 3 4 5; do
  t0=$(date +%s%N); $cli show; sleep 0.3
  t1=$(date +%s%N); $cli hide; sleep 0.3
  open=$(grep openlayer "$events" | sed -n "${i}p" | cut -d' ' -f1)
  close=$(grep closelayer "$events" | sed -n "${i}p" | cut -d' ' -f1)
  if [[ -z $open || -z $close ]]; then bad "run $i: no layer event seen"; continue; fi
  show_ms=$(( (open - t0) / 1000000 )); hide_ms=$(( (close - t1) / 1000000 ))
  printf '        run %d: show %3d ms, hide %3d ms\n' "$i" "$show_ms" "$hide_ms"
  (( show_ms > worst )) && worst=$show_ms
  (( hide_ms > worst )) && worst=$hide_ms
done
kill "$watcher" 2>/dev/null; pkill -f "socat -u UNIX-CONNECT:$sock" 2>/dev/null; rm -f "$events"
(( worst > 0 && worst < 100 )) && pass "worst toggle ${worst} ms" || bad "worst toggle ${worst} ms"

exit $fail
