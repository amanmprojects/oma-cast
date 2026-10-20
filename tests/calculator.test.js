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

test("currency conversions", () => {
  assert.equal(Calculator.evaluate("100 usd in eur").formatted, "92 EUR")
  assert.equal(Calculator.evaluate("$100 to eur").formatted, "92 EUR")
  assert.equal(Calculator.evaluate("€50 in usd").formatted, "54.347826087 USD")
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
