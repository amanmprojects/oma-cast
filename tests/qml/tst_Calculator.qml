import QtQuick
import QtTest
import "../../plugin/core/Calculator.js" as Calculator

TestCase {
  name: "CalculatorQmlRuntime"

  function test_parser() {
    var cases = [
      ["2+2", "4"], ["-2^2", "-4"], ["2^-2", "0.25"],
      ["2^3^2", "512"], ["200 + 10% + 5", "225"],
      ["100 * 10%", "10"], ["max(1,2)", "2"],
      ["1 + sqrt(4)", "3"], ["1e3+1", "1,001"],
      ["12 / 100000000000", "1.2e-10"],
      ["1000000000001 in dec", "1000000000001"],
      ["-40 °C in °F", "-40 °F"], ["= .5", "0.5"]
    ]
    for (var i = 0; i < cases.length; i++) {
      var result = Calculator.evaluate(cases[i][0])
      verify(result !== null, cases[i][0])
      compare(result.formatted, cases[i][1], cases[i][0])
    }
  }

  function test_errors() {
    var cases = ["1..5 km in m", "15..5% of 80", "sqrt(4,9)", "5 % 0", "9007199254740992 in hex", "firefox", "/usr/bin/cat"]
    for (var i = 0; i < cases.length; i++) compare(Calculator.evaluate(cases[i]), null, cases[i])
  }

  function test_currencyAndCopy() {
    var currency = { rates: { USD: 1, EUR: 0.8 }, source: "ECB via Frankfurter", date: "2026-10-19", stale: false }
    var result = Calculator.evaluate("100 usd in eur", currency)
    compare(result.formatted, "80 EUR")
    compare(result.rateDate, "2026-10-19")
    compare(Calculator.copyText(result, "copy-raw"), "80")
    compare(Calculator.copyText(result, "copy-equation"), "100 usd in eur = 80 EUR")
    compare(Calculator.evaluate("100 usd in eur").error, "Currency rates unavailable")
    compare(Calculator.evaluate("1 btc in usd", currency).error, "Unsupported currency: BTC")
    compare(Calculator.evaluate("42", currency, { force: true }).raw, 42)
  }
}
