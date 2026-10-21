#!/bin/bash
# Quickshell registers its QML types statically, so qmltestrunner cannot load
# Quickshell.Io. Rates run offscreen; `launcher` tests use hidden Wayland windows.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/plugin/core" "$stage/plugin/services" "$stage/tests/qml" "$stage/readonly"
chmod 555 "$stage/readonly"
cp "$root/plugin/core/ExchangeRates.js" "$stage/plugin/core/"
cp "$root/plugin/services/CurrencyRates.qml" "$stage/plugin/services/"
if [[ ${1:-} == launcher ]]; then
  cp "$root/plugin/core/"{Calculator,RootSearch,Ranker,Frecency}.js "$stage/plugin/core/"
  cp -r "$root/plugin/ui" "$stage/plugin/"
  cp "$root/tests/qml/tst_Launcher.qml" "$stage/tests/qml/TestCaseHost.qml"
  shell_dir="${OMARCHY_PATH:-/usr/share/omarchy}/shell"
  cp -r "$shell_dir/Commons" "$shell_dir/Ui" "$stage/"
else
  cp "$root/tests/qml/tst_CurrencyRates.qml" "$stage/tests/qml/TestCaseHost.qml"
fi
cp "$root/tests/qml/ServiceTests.qml" "$stage/shell.qml"
# Imports remain inside the isolated config root, as Quickshell requires.
log="$stage/results.log"
set +e
if [[ ${1:-} == launcher ]]; then
  # PanelWindow needs the Wayland backend, but every test window stays hidden.
  timeout 30s env QT_QPA_PLATFORM=wayland QT_QUICK_CONTROLS_STYLE=Basic QT_QPA_PLATFORMTHEME=generic qs -p "$stage" --no-color >"$log" 2>&1
else
  timeout 30s env -u WAYLAND_DISPLAY -u DISPLAY OMA_CAST_TEST_CACHE="$stage/rates.json" OMA_CAST_TEST_FAIL_CACHE="$stage/readonly/rates.json" QT_QPA_PLATFORM=offscreen QT_QUICK_CONTROLS_STYLE=Basic QT_QPA_PLATFORMTHEME=generic qs -p "$stage" --no-color >"$log" 2>&1
fi
code=$?
set -e
grep -E 'PASS|FAIL|Totals:|ERROR|WARN|QWARN|Config:|INFO' "$log" || true
[[ $code == 0 ]] || exit "$code"
grep -q 'SERVICE_TEST_RESULT.*"failed":0.*"completed":true' "$log"
! grep -qE 'FAIL!|ERROR|[1-9][0-9]* failed' "$log"
