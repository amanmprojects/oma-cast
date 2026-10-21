const test = require("node:test")
const assert = require("node:assert/strict")
const Rates = require("../plugin/core/ExchangeRates.js")

const NOW = Date.UTC(2026, 9, 21, 12)
const fixture = () => ({ amount: 1, base: "USD", date: "2026-10-20", rates: { EUR: 0.8, GBP: 0.5, INR: 80 } })
const snapshot = () => Rates.snapshotFromResponse(fixture(), NOW).snapshot
const cache = (patch) => JSON.stringify({ ...snapshot(), ...patch })

test("provider response becomes a dated USD snapshot without mutating input", () => {
  const payload = fixture()
  const before = JSON.stringify(payload)
  const result = Rates.snapshotFromResponse(payload, NOW)
  assert.equal(result.error, "")
  assert.deepEqual(result.snapshot, { schemaVersion: 1, source: "ECB via Frankfurter", base: "USD", date: "2026-10-20", fetchedAt: NOW, rates: { USD: 1, EUR: 0.8, GBP: 0.5, INR: 80 } })
  assert.equal(JSON.stringify(payload), before)
  assert.equal(payload.rates.USD, undefined)
  assert.equal(result.snapshot.rates === payload.rates, false)
})

test("provider schema and finite positive rates are validated", () => {
  const invalid = [null, [], {}, { ...fixture(), base: "EUR" }, { ...fixture(), amount: 100 }, { ...fixture(), amount: "1" }, { ...fixture(), rates: [] }, { ...fixture(), rates: {} }]
  for (const value of [0, -1, Infinity, NaN, "0.8", null]) invalid.push({ ...fixture(), rates: { EUR: value } })
  for (const payload of invalid) {
    const result = Rates.snapshotFromResponse(payload, NOW)
    assert.equal(result.snapshot, null)
    assert.ok(result.error)
  }
  assert.ok(Rates.snapshotFromResponse(fixture(), Infinity).error)
  assert.ok(Rates.snapshotFromResponse(fixture(), NaN).error)
})

test("currency keys cannot introduce crypto, inherited entries or prototype pollution", () => {
  for (const key of ["BTC", "ETH", "XYZ", "eur", "constructor", "toString", "__proto__"]) {
    const rates = JSON.parse('{"EUR":0.8,"' + key + '":1}')
    assert.ok(Rates.snapshotFromResponse({ ...fixture(), rates }, NOW).error, key)
  }
  const inherited = Object.create({ EUR: 0.8 })
  assert.ok(Rates.snapshotFromResponse({ ...fixture(), rates: inherited }, NOW).error)
  assert.ok(Rates.snapshotFromResponse({ ...fixture(), rates: { EUR: 0.8, USD: 2 } }, NOW).error)
  assert.equal({}.EUR, undefined)
})

test("rate dates are real calendar days, not future or before ECB history", () => {
  for (const date of ["2026-02-30", "2026-10-22", "2026-13-01", "2026-00-01", "2026-10-2", "1999-01-03", "not-a-date", null]) assert.ok(Rates.snapshotFromResponse({ ...fixture(), date }, NOW).error, String(date))
  assert.equal(Rates.snapshotFromResponse({ ...fixture(), date: "2024-02-29" }, NOW).error, "")
  assert.ok(Rates.snapshotFromResponse({ ...fixture(), date: "2025-02-29" }, NOW).error)
})

test("a response cannot roll back a newer cached rate date", () => {
  const previous = snapshot()
  const before = JSON.stringify(previous)
  assert.ok(Rates.snapshotFromResponse({ ...fixture(), date: "2026-10-19" }, NOW, previous).error)
  assert.equal(Rates.snapshotFromResponse(fixture(), NOW + 1000, previous).snapshot.fetchedAt, NOW + 1000)
  assert.equal(JSON.stringify(previous), before)
})

test("cache round trips and accepts missing files without treating them as corruption", () => {
  assert.deepEqual(Rates.parseCache(cache(), NOW), { snapshot: snapshot(), error: "", readOnly: false })
  for (const text of ["", null, undefined]) assert.deepEqual(Rates.parseCache(text, NOW), { snapshot: null, error: "", readOnly: false })
})

test("malformed, newer, and unsupported caches stay read-only", () => {
  for (const text of [" ", "{bad", "[]", "null", cache({ schemaVersion: 2 }), cache({ schemaVersion: "1" }), cache({ source: "unknown" }), cache({ base: "EUR" }), cache({ rates: { EUR: 0.8 } }), cache({ rates: { USD: 1, EUR: -1 } }), cache({ rates: { USD: 1, EUR: 0.8, BTC: 1 } }), " ".repeat(Rates.MAX_RESPONSE_BYTES + 1)]) {
    const result = Rates.parseCache(text, NOW)
    assert.equal(result.snapshot, null, text.slice(0, 30))
    assert.equal(result.readOnly, true)
    assert.ok(result.error)
  }
})

test("cache timestamps are finite and cannot lie about future data", () => {
  for (const fetchedAt of [0, -1, Infinity, null, "123", NOW + 5 * 60 * 1000 + 1]) assert.equal(Rates.parseCache(cache({ fetchedAt }), NOW).readOnly, true)
  assert.equal(Rates.parseCache(cache({ fetchedAt: NOW + 5 * 60 * 1000 }), NOW).readOnly, false)
  assert.equal(Rates.parseCache(cache({ date: "2026-10-21", fetchedAt: Date.UTC(2026, 9, 20, 12) }), NOW).readOnly, true)
  assert.equal(Rates.parseCache(cache({ date: "2026-10-22" }), NOW).readOnly, true)
})

test("daily refresh TTL, explicit refresh cooldown and retries are bounded", () => {
  const s = snapshot()
  assert.equal(Rates.needsRefresh(null, NOW, 0, 0, false), true)
  assert.equal(Rates.needsRefresh(s, NOW + Rates.TTL_MS - 1, 0, 0, false), false)
  assert.equal(Rates.needsRefresh(s, NOW + Rates.TTL_MS, 0, 0, false), true)
  assert.equal(Rates.needsRefresh(s, NOW, 0, 0, true), true)
  assert.equal(Rates.needsRefresh(null, NOW + Rates.MIN_REFRESH_MS - 1, NOW, 0, true), false)
  assert.equal(Rates.needsRefresh(null, NOW + Rates.MIN_REFRESH_MS, NOW, 0, true), true)
  assert.equal(Rates.needsRefresh(null, NOW, NOW, NOW + Rates.RETRY_MS, true), false)
  assert.equal(Rates.needsRefresh(null, NOW + Rates.RETRY_MS, NOW, NOW + Rates.RETRY_MS, false), true)
  assert.equal(Rates.needsRefresh(null, NaN, 0, 0, true), false)
})

test("clock rollback does not create an indefinite refresh block", () => {
  const s = snapshot()
  assert.equal(Rates.needsRefresh(s, NOW - 1000, NOW, NOW + Rates.RETRY_MS, true), false)
  assert.equal(Rates.needsRefresh(s, NOW - Rates.TTL_MS, NOW, NOW + Rates.RETRY_MS, false), true)
})

test("currency context distinguishes dated cached rates from stale or missing rates", () => {
  const s = snapshot()
  const before = JSON.stringify(s)
  assert.equal(Rates.context(s, NOW, false, "").stale, false)
  assert.equal(Rates.context(s, NaN, false, "").stale, true)
  assert.equal(Rates.context(s, NOW + Rates.TTL_MS, false, "offline").stale, true)
  assert.equal(Rates.context({ ...s, date: "2026-10-13" }, NOW, false, "").stale, true)
  assert.equal(Rates.context({ ...s, date: "2026-10-14" }, NOW, false, "").stale, false)
  const weekend = Date.UTC(2026, 9, 25, 12)
  assert.equal(Rates.context({ ...s, date: "2026-10-23", fetchedAt: weekend }, weekend, false, "").stale, false)
  const empty = Rates.context(null, NOW, true, "offline")
  assert.equal(empty.rates, null)
  assert.equal(empty.loading, true)
  assert.equal(empty.date, "")
  assert.equal(empty.lastError, "offline")
  assert.equal(JSON.stringify(s), before)
})
