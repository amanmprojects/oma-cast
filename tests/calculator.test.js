const test = require("node:test")
const assert = require("node:assert/strict")
const Calculator = require("../plugin/core/Calculator.js")

test("basic arithmetic operations", () => {
  assert.equal(Calculator.evaluate("2+2").formatted, "4")
  assert.equal(Calculator.evaluate("10 - 3").formatted, "7")
  assert.equal(Calculator.evaluate("12 * 8").formatted, "96")
  assert.equal(Calculator.evaluate("100 / 4").formatted, "25")
  assert.equal(Calculator.evaluate("24 x 60").formatted, "1,440")
  assert.equal(Calculator.evaluate("2 ^ 10").formatted, "1,024")
  assert.equal(Calculator.evaluate("2 ** 8").formatted, "256")
  assert.equal(Calculator.evaluate("10 % 3").formatted, "1")
  assert.equal(Calculator.evaluate("2 ^ -2").formatted, "0.25")
})

test("operator precedence and parentheses", () => {
  assert.equal(Calculator.evaluate("2 + 3 * 4").formatted, "14")
  assert.equal(Calculator.evaluate("(2 + 3) * 4").formatted, "20")
  assert.equal(Calculator.evaluate("2 * (3 + (4 * 5))").formatted, "46")
})

test("floating point numbers and clean precision", () => {
  assert.equal(Calculator.evaluate("0.1 + 0.2").formatted, "0.3")
  assert.equal(Calculator.evaluate("10 / 3").formatted, "3.33333333333")
  assert.equal(Calculator.evaluate("1.5 * 2.5").formatted, "3.75")
  assert.equal(Calculator.evaluate("1000 * 1000").formatted, "1,000,000")
})

test("percentages", () => {
  assert.equal(Calculator.evaluate("15% of 80").formatted, "12")
  assert.equal(Calculator.evaluate("200 + 10%").formatted, "220")
  assert.equal(Calculator.evaluate("200 - 15%").formatted, "170")
  assert.equal(Calculator.evaluate("20 in % of 80").formatted, "25%")
})

test("math functions and constants", () => {
  assert.equal(Calculator.evaluate("sqrt(144)").formatted, "12")
  assert.equal(Calculator.evaluate("cbrt(27)").formatted, "3")
  assert.equal(Calculator.evaluate("abs(-42)").formatted, "42")
  assert.equal(Calculator.evaluate("round(3.7)").formatted, "4")
  assert.equal(Calculator.evaluate("floor(3.7)").formatted, "3")
  assert.equal(Calculator.evaluate("ceil(3.2)").formatted, "4")
  assert.equal(Calculator.evaluate("log(100)").formatted, "2")
  assert.equal(Calculator.evaluate("2 * pi").formatted, "6.28318530718")
})

test("unit conversions", () => {
  assert.equal(Calculator.evaluate("5 km in mi").formatted, "3.10685596119 mi")
  assert.equal(Calculator.evaluate("2.5 km in m").formatted, "2,500 m")
  assert.equal(Calculator.evaluate("100 m in ft").formatted, "328.083989501 ft")
  assert.equal(Calculator.evaluate("10 kg in lb").formatted, "22.0462262185 lb")
  assert.equal(Calculator.evaluate("1024 mb in gb").formatted, "1.024 gb")
  assert.equal(Calculator.evaluate("3 hours in min").formatted, "180 min")
  assert.equal(Calculator.evaluate("2 days in hours").formatted, "48 hours")
  assert.equal(Calculator.evaluate("100 c in f").formatted, "212 °F")
  assert.equal(Calculator.evaluate("32 f in c").formatted, "0 °C")
  assert.equal(Calculator.evaluate("0 c in k").formatted, "273.15 K")
  assert.equal(Calculator.evaluate("1 gal in l").formatted, "3.785411784 l")
})

// Fictional deterministic rates; tests never need the network.
const currency = { rates: { USD: 1, EUR: 0.8, GBP: 0.5, INR: 80 }, source: "ECB via Frankfurter", date: "2026-10-19", stale: false }

test("currency conversions use the injected dated snapshot", () => {
  assert.equal(Calculator.evaluate("100 usd in eur", currency).formatted, "80 EUR")
  assert.equal(Calculator.evaluate("$100 to eur", currency).formatted, "80 EUR")
  assert.equal(Calculator.evaluate("€50 in usd", currency).formatted, "62.5 USD")
  assert.equal(Calculator.evaluate("100 EUR in GBP", currency).formatted, "62.5 GBP")
  assert.equal(Calculator.evaluate("₹80 in usd", currency).formatted, "1 USD")
  assert.equal(Calculator.evaluate("-$100 in eur", currency).formatted, "-80 EUR")
  assert.equal(Calculator.evaluate("$-100 in eur", currency).formatted, "-80 EUR")
  const result = Calculator.evaluate("100 usd in eur", currency)
  assert.equal(result.rateDate, currency.date)
  assert.equal(result.rateSource, currency.source)
  assert.equal(result.stale, false)
  assert.equal(Calculator.evaluate("100 usd in eur", { ...currency, stale: true }).stale, true)
  assert.equal(Calculator.evaluate("100 usd in eur", { ...currency, rates: { USD: 1, EUR: 0.6 } }).raw, 60)
})

test("missing or unsupported currency rates never produce invented results", () => {
  const missing = Calculator.evaluate("100 usd in eur")
  assert.equal(missing.error, "Currency rates unavailable")
  assert.equal(missing.raw, undefined)
  assert.equal(missing.formatted, undefined)
  assert.match(Calculator.evaluate("100 usd in eur", { loading: true }).error, /loading/)
  for (const code of ["btc", "eth", "xyz"]) {
    const unsupported = Calculator.evaluate("1 " + code + " in usd", currency)
    assert.match(unsupported.error, /Unsupported currency/)
    assert.equal(unsupported.raw, undefined)
  }
  for (const rate of [0, -1, Infinity, NaN, "0.8"]) {
    assert.match(Calculator.evaluate("100 usd in eur", { ...currency, rates: { USD: 1, EUR: rate } }).error, /unavailable/)
  }
  assert.equal(Calculator.evaluate("$100 km in mi", currency), null)
  assert.equal(Calculator.evaluate("$100 eur in usd", currency), null)
})

test("base conversions", () => {
  assert.equal(Calculator.evaluate("255 in hex").formatted, "0xFF")
  assert.equal(Calculator.evaluate("0xff in dec").formatted, "255")
  assert.equal(Calculator.evaluate("15 in bin").formatted, "0b1111")
  assert.equal(Calculator.evaluate("0b1010 in dec").formatted, "10")
})

test("forced calculations with leading '='", () => {
  assert.equal(Calculator.evaluate("= 42").formatted, "42")
  assert.equal(Calculator.evaluate("= 5 * 5").formatted, "25")
  assert.equal(Calculator.evaluate("= -5").formatted, "-5")
})

test("error and edge case handling (returns null, no throws)", () => {
  assert.equal(Calculator.evaluate("10 / 0"), null) // division by zero
  assert.equal(Calculator.evaluate("(2 + 2"), null) // unmatched paren
  assert.equal(Calculator.evaluate("2 + * 3"), null) // syntax error
  assert.equal(Calculator.evaluate(""), null)
  assert.equal(Calculator.evaluate(null), null)
})

test("intent filter: ignores non-math searches", () => {
  assert.equal(Calculator.evaluate("firefox"), null)
  assert.equal(Calculator.evaluate("settings"), null)
  assert.equal(Calculator.evaluate("/usr/bin/python"), null)
  assert.equal(Calculator.evaluate("git commit -m"), null)
  assert.equal(Calculator.evaluate("node -v"), null)
  assert.equal(Calculator.evaluate("42"), null) // single number without '=' or operator ignored
  assert.equal(Calculator.evaluate("-5"), null) // unary minus alone is not a calculation
})

test("scientific formatting preserves the exponent and never zeros small results", () => {
  for (const [query, raw, formatted] of [
    ["12 / 100000000000", 1.2e-10, "1.2e-10"],
    ["1 / 10000000000000", 1e-13, "1e-13"],
    ["-12 / 100000000000", -1.2e-10, "-1.2e-10"],
    ["1.2e30 * 1", 1.2e30, "1.2e+30"],
    ["1e-300 / 10", 1e-301, "1e-301"]
  ]) {
    const result = Calculator.evaluate(query)
    assert.equal(result.raw, raw, query)
    assert.equal(result.formatted, formatted, query)
    assert.equal(Number(result.formatted), Number(raw.toPrecision(12)), query)
  }
})

test("raw results and safe integer base conversions are never rounded", () => {
  assert.equal(Calculator.evaluate("0.1 + 0.2").raw, 0.1 + 0.2)
  assert.equal(Calculator.evaluate("10 / 3").raw, 10 / 3)
  assert.equal(Calculator.evaluate("1000000000001 + 0").formatted, "1,000,000,000,001")
  assert.equal(Calculator.evaluate("1000000000001 in dec").formatted, "1000000000001")
  assert.equal(Calculator.evaluate("9007199254740991 in hex").formatted, "0x1FFFFFFFFFFFFF")
  assert.equal(Calculator.evaluate("-255 in hex").formatted, "-0xFF")
  assert.equal(Calculator.evaluate("-0xff in dec").formatted, "-255")
  for (const query of ["9007199254740992 in hex", "9007199254740993 in dec", "0x20000000000001 in dec", "1.5 in hex"]) assert.equal(Calculator.evaluate(query), null, query)
})

test("postfix and chained percentages stay distinct from modulo", () => {
  for (const [query, expected] of [
    ["200 + 10% + 5", 225], ["200 - 10% - 5", 175],
    ["200 + 10% + 5%", 231], ["50%", 0.5], ["100 * 10%", 10],
    ["10% * 100", 10], ["200 + (5 + 5)%", 220], ["200 + 10% * 2", 240],
    ["10% + 20%", 0.3], ["-10%", -0.1], ["5 % 2", 1],
    ["10 % (-3)", 1], ["15 % of -80", -12], ["-20 as % of 80", -25]
  ]) assert.ok(Math.abs(Calculator.evaluate(query).raw - expected) < 1e-12, query)
  assert.equal(Calculator.evaluate("5 % 0"), null)
})

test("powers are right associative and bind tighter than unary signs", () => {
  for (const [query, expected] of [
    ["-2^2", -4], ["(-2)^2", 4], ["2^-2", 0.25], ["2^3^2", 512],
    ["-2**2", -4], ["-(2+3)^2", -25], ["-2^-2", -0.25]
  ]) assert.equal(Calculator.evaluate(query).raw, expected, query)
})

test("supported functions are recognized anywhere and validate arity", () => {
  for (const [query, expected] of [
    ["max(1,2)", 2], ["min(2,3,1)", 1], ["pow(2,3)", 8],
    ["1 + sqrt(4)", 3], ["log10(100)", 2], ["log2(8)", 3],
    ["trunc(-1.5)", -1], ["asin(0)", 0], ["exp(0)", 1],
    ["1e3 + 1", 1001], ["1e-3 * 2", 0.002], [".5 + 1.", 1.5],
    ["sqrt(max(4,9))", 3], ["2\t+\n3", 5], ["4 ÷ 2", 2], ["2x3", 6], ["2xpi", 2 * Math.PI]
  ]) assert.equal(Calculator.evaluate(query).raw, expected, query)
  for (const query of ["sqrt()", "sqrt(4,9)", "pow(2)", "pow(2,3,4)", "max()", "min()", "unknown(2)", "sqrt(-1)", "log(0)", "min(1, exp(1000))", "1 / (1e308 * 1e308)"]) assert.equal(Calculator.evaluate(query), null, query)
})

test("signed, decimal and scientific unit amounts are strict", () => {
  for (const [query, expected] of [
    ["-40 c in f", "-40 °F"], ["-40 °C in °F", "-40 °F"],
    ["+1 km in m", "1,000 m"], [".5 km in m", "500 m"],
    ["1e3 m in km", "1 km"], ["6ft in cm", "182.88 cm"]
  ]) assert.equal(Calculator.evaluate(query).formatted, expected, query)
  for (const query of ["1..5 km in m", "15..5% of 80", "1.2.3 as % of 4", "1e km in m", "1e309 km in m", "0 as % of 1e999", "1e308 km in mm", "1 m in kg", "1 constructor in constructor", "-$-1 in usd"]) assert.equal(Calculator.evaluate(query), null, query)
})

test("explicit evaluation bypasses root-search suppression", () => {
  for (const query of ["5", "42", ".5", "-5", "1e3", "pi"]) {
    assert.equal(Calculator.evaluate(query), null, query)
    assert.ok(Calculator.evaluate(query, null, { force: true }), query)
    assert.ok(Calculator.evaluate("=" + query), query)
  }
})

test("copy actions use the evaluated result and reject invalid actions", () => {
  const result = Calculator.evaluate("100 usd in eur", currency)
  assert.equal(Calculator.copyText(result, "copy-result"), "80 EUR")
  assert.equal(Calculator.copyText(result, "open"), "80 EUR")
  assert.equal(Calculator.copyText(result, "copy-equation"), "100 usd in eur = 80 EUR")
  assert.equal(Calculator.copyText(result, "copy-raw"), "80")
  const fractional = Calculator.evaluate("10/3")
  assert.equal(Calculator.copyText(fractional, "copy-raw"), String(10 / 3))
  assert.throws(() => Calculator.copyText(result, "disable"), /Unknown calculator action/)
  assert.throws(() => Calculator.copyText(Calculator.evaluate("100 usd in eur"), "copy-result"), /unavailable/)
})

test("hostile or overly nested input cannot stall the shell or throw from search", () => {
  for (const query of ["1+".repeat(1000), "(".repeat(80) + "1" + ")".repeat(80), "-".repeat(80) + "1", "1^".repeat(80) + "1", "1+globalThis.process.exit(0)", "1 + Object.constructor(2)", "2;quit()", "1,000 + 2"]) assert.equal(Calculator.evaluate(query), null, query.slice(0, 40))
  for (const value of [undefined, {}, [], 1, false]) assert.equal(Calculator.evaluate(value), null)
})
