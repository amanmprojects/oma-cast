// Daily ECB reference-rate snapshots (SPEC §8.1). No network or Qt imports;
// CurrencyRates.qml owns I/O and injects this policy's context into Calculator.

var ENDPOINT = "https://api.frankfurter.dev/v1/latest?base=USD"
var SOURCE = "ECB via Frankfurter"
var TTL_MS = 24 * 60 * 60 * 1000
var RETRY_MS = 15 * 60 * 1000             // [D] Back off after a failed request.
var MIN_REFRESH_MS = 60 * 1000           // [D] Includes explicit refresh requests.
var MAX_RESPONSE_BYTES = 65536
var CLOCK_SKEW_MS = 5 * 60 * 1000
var FIAT = "AUD BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS INR ISK JPY KRW MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR".split(" ")

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  var prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function clock(value) {
  return typeof value === "number" && isFinite(value) && value > 0 && value <= 8640000000000000
}

function day(value) { return new Date(value).toISOString().slice(0, 10) }

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1999-01-04") return false
  var ms = Date.parse(value + "T00:00:00.000Z")
  return isFinite(ms) && day(ms) === value
}

function normalizeRates(value, includeBase) {
  if (!plainObject(value)) return { error: "Rates must be an object" }
  var keys = Object.keys(value)
  var rates = { USD: 1 }
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i]
    var rate = value[key]
    if (FIAT.indexOf(key) < 0) return { error: "Unsupported currency in rates: " + key }
    if (typeof rate !== "number" || !isFinite(rate) || !(rate > 0)) return { error: "Invalid rate for " + key }
    if (key === "USD" && rate !== 1) return { error: "USD base rate must be 1" }
    rates[key] = rate
  }
  if (!Object.prototype.hasOwnProperty.call(rates, "EUR")) return { error: "Missing EUR rate" }
  if (includeBase && !Object.prototype.hasOwnProperty.call(value, "USD")) return { error: "Missing USD base rate" }
  return { rates: rates, error: "" }
}

function snapshotFromResponse(payload, nowMs, previous) {
  if (!clock(nowMs)) return { snapshot: null, error: "Invalid current time" }
  if (!plainObject(payload) || payload.base !== "USD" || payload.amount !== 1) return { snapshot: null, error: "Expected rates for 1 USD" }
  if (!validDate(payload.date) || payload.date > day(nowMs)) return { snapshot: null, error: "Invalid or future rate date" }
  if (previous && payload.date < previous.date) return { snapshot: null, error: "Rate date is older than the cached snapshot" }
  var result = normalizeRates(payload.rates, false)
  if (result.error) return { snapshot: null, error: result.error }
  return {
    snapshot: { schemaVersion: 1, source: SOURCE, base: "USD", date: payload.date, fetchedAt: nowMs, rates: result.rates },
    error: ""
  }
}

function parseCache(text, nowMs) {
  if (text === "" || text === null || text === undefined) return { snapshot: null, error: "", readOnly: false }
  var error = ""
  var parsed = null
  try {
    if (typeof text !== "string" || text.length > MAX_RESPONSE_BYTES) throw new Error("Cache is too large or is not text")
    parsed = JSON.parse(text)
    if (!plainObject(parsed) || parsed.schemaVersion !== 1) throw new Error("Unsupported currency cache schema")
    if (parsed.source !== SOURCE || parsed.base !== "USD") throw new Error("Invalid currency cache source or base")
    if (!clock(nowMs) || !clock(parsed.fetchedAt) || parsed.fetchedAt > nowMs + CLOCK_SKEW_MS) throw new Error("Invalid or future cache timestamp")
    if (!validDate(parsed.date) || parsed.date > day(nowMs) || parsed.date > day(parsed.fetchedAt)) throw new Error("Invalid or future cached rate date")
    var result = normalizeRates(parsed.rates, true)
    if (result.error) throw new Error(result.error)
    parsed = { schemaVersion: 1, source: SOURCE, base: "USD", date: parsed.date, fetchedAt: parsed.fetchedAt, rates: result.rates }
  } catch (e) { error = String(e.message || e) }
  return { snapshot: error ? null : parsed, error: error, readOnly: !!error }
}

function needsRefresh(snapshot, nowMs, lastAttemptMs, retryAtMs, force) {
  if (!clock(nowMs)) return false
  // A substantial clock rollback must not suppress refreshing indefinitely.
  if (retryAtMs > nowMs && retryAtMs - nowMs <= RETRY_MS + CLOCK_SKEW_MS) return false
  if (lastAttemptMs > 0 && nowMs - lastAttemptMs < MIN_REFRESH_MS && lastAttemptMs - nowMs <= CLOCK_SKEW_MS) return false
  if (force || !snapshot) return true
  var age = nowMs - snapshot.fetchedAt
  return age >= TTL_MS || age < -CLOCK_SKEW_MS
}

function context(snapshot, nowMs, loading, lastError) {
  var age = snapshot ? nowMs - snapshot.fetchedAt : 0
  // [D] Weekends/holidays retain the last business-day quote. A quote over a
  // week old is labelled stale even if the server just returned it again.
  var validNow = clock(nowMs)
  var oldQuote = snapshot && validNow && Date.parse(snapshot.date + "T00:00:00.000Z") < Date.parse(day(nowMs) + "T00:00:00.000Z") - 7 * TTL_MS
  return {
    rates: snapshot ? snapshot.rates : null,
    base: "USD", source: SOURCE,
    date: snapshot ? snapshot.date : "",
    fetchedAt: snapshot ? snapshot.fetchedAt : null,
    stale: !!(snapshot && (!validNow || age >= TTL_MS || age < -CLOCK_SKEW_MS || oldQuote)),
    loading: !!loading, lastError: String(lastError || "")
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    ENDPOINT: ENDPOINT, SOURCE: SOURCE, TTL_MS: TTL_MS, RETRY_MS: RETRY_MS,
    MIN_REFRESH_MS: MIN_REFRESH_MS, MAX_RESPONSE_BYTES: MAX_RESPONSE_BYTES,
    snapshotFromResponse: snapshotFromResponse, parseCache: parseCache,
    needsRefresh: needsRefresh, context: context
  }
}
