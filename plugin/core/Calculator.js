// Calculator engine (SPEC §8.1 P0, §12 Phase 2).
//
// Evaluates math expressions, percentages, units and currency conversions,
// and base conversions (hex/bin/oct) safely without eval().
//
// Designed to run in both Node.js (unit tests) and Quickshell's QML JS runtime.

var MAX_SAFE_DECIMALS = 10

// ----------------------------------------------------------- Unit definitions

var LENGTH_UNITS = {
  km: 1000,
  kilometer: 1000,
  kilometers: 1000,
  kilometre: 1000,
  kilometres: 1000,
  m: 1,
  meter: 1,
  meters: 1,
  metre: 1,
  metres: 1,
  cm: 0.01,
  centimeter: 0.01,
  centimeters: 0.01,
  centimetre: 0.01,
  centimetres: 0.01,
  mm: 0.001,
  millimeter: 0.001,
  millimeters: 0.001,
  millimetre: 0.001,
  millimetres: 0.001,
  mi: 1609.344,
  mile: 1609.344,
  miles: 1609.344,
  yd: 0.9144,
  yard: 0.9144,
  yards: 0.9144,
  ft: 0.3048,
  foot: 0.3048,
  feet: 0.3048,
  in: 0.0254,
  inch: 0.0254,
  inches: 0.0254
}

var MASS_UNITS = {
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  kgs: 1000,
  g: 1,
  gram: 1,
  grams: 1,
  mg: 0.001,
  milligram: 0.001,
  milligrams: 0.001,
  lb: 453.59237,
  lbs: 453.59237,
  pound: 453.59237,
  pounds: 453.59237,
  oz: 28.349523125,
  ounce: 28.349523125,
  ounces: 28.349523125,
  ton: 1000000,
  tonne: 1000000,
  tonnes: 1000000
}

var TIME_UNITS = {
  ms: 0.001,
  millisecond: 0.001,
  milliseconds: 0.001,
  s: 1,
  sec: 1,
  second: 1,
  seconds: 1,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  d: 86400,
  day: 86400,
  days: 86400,
  wk: 604800,
  week: 604800,
  weeks: 604800,
  mo: 2629800,
  month: 2629800,
  months: 2629800,
  yr: 31557600,
  year: 31557600,
  years: 31557600
}

var DATA_UNITS = {
  b: 1,
  byte: 1,
  bytes: 1,
  kb: 1000,
  kib: 1024,
  mb: 1000000,
  mib: 1048576,
  gb: 1e9,
  gib: 1073741824,
  tb: 1e12,
  tib: 1099511627776,
  pb: 1e15,
  pib: 1125899906842624
}

var VOLUME_UNITS = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  millilitre: 1,
  millilitres: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
  gal: 3785.411784,
  gallon: 3785.411784,
  gallons: 3785.411784,
  qt: 946.352946,
  quart: 946.352946,
  quarts: 946.352946,
  pt: 473.176473,
  pint: 473.176473,
  pints: 473.176473,
  cup: 236.5882365,
  cups: 236.5882365,
  floz: 29.5735295625,
  tbsp: 14.78676478125,
  tsp: 4.92892159375
}

// Baseline exchange rates relative to USD (1.0).
var CURRENCY_RATES = {
  usd: 1.0,
  eur: 0.92,
  gbp: 0.79,
  cad: 1.38,
  aud: 1.52,
  jpy: 152.0,
  inr: 84.0,
  chf: 0.88,
  cny: 7.23,
  nzd: 1.68,
  brl: 5.70,
  sek: 10.6,
  krw: 1380.0,
  mxn: 19.8,
  sgd: 1.32,
  hkd: 7.77,
  nok: 10.9,
  btc: 0.000015,
  eth: 0.00038
}

var CURRENCY_SYMBOLS = {
  $: "usd",
  "€": "eur",
  "£": "gbp",
  "¥": "jpy",
  "₹": "inr",
  "₩": "krw"
}

// ------------------------------------------------------------- Number cleaning

function cleanFloat(n) {
  if (!isFinite(n)) return n
  var rounded = Number(n.toPrecision(12))
  return Math.abs(rounded) < 1e-12 ? 0 : rounded
}

function formatNumber(n) {
  var val = cleanFloat(n)
  if (!isFinite(val)) return String(n)

  var parts = String(val).split(".")
  var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  if (parts.length > 1) {
    var decPart = parts[1].replace(/0+$/, "")
    return decPart.length > 0 ? intPart + "." + decPart : intPart
  }
  return intPart
}

// -------------------------------------------------------- Base conversions

function convertBase(val, targetBase) {
  var n = Math.trunc(cleanFloat(val))
  if (!isFinite(n)) return null
  var tb = targetBase.toLowerCase()
  switch (tb) {
    case "hex":
      return (n < 0 ? "-0x" : "0x") + Math.abs(n).toString(16).toUpperCase()
    case "bin":
    case "binary":
      return (n < 0 ? "-0b" : "0b") + Math.abs(n).toString(2)
    case "oct":
    case "octal":
      return (n < 0 ? "-0o" : "0o") + Math.abs(n).toString(8)
    case "dec":
    case "decimal":
      return String(n)
  }
  return null
}

// ------------------------------------------------------- Unit Conversions

function convertTemperature(value, fromUnit, toUnit) {
  var from = fromUnit.toLowerCase()
  var to = toUnit.toLowerCase()
  var cVal
  if (from === "c" || from === "celsius") cVal = value
  else if (from === "f" || from === "fahrenheit") cVal = (value - 32) * (5 / 9)
  else if (from === "k" || from === "kelvin") cVal = value - 273.15
  else return null

  var result
  var targetLabel = toUnit
  if (to === "c" || to === "celsius") {
    result = cVal
    targetLabel = "°C"
  } else if (to === "f" || to === "fahrenheit") {
    result = cVal * (9 / 5) + 32
    targetLabel = "°F"
  } else if (to === "k" || to === "kelvin") {
    result = cVal + 273.15
    targetLabel = "K"
  } else return null

  return {
    raw: result,
    formatted: formatNumber(result) + " " + targetLabel
  }
}

function convertUnits(val, fromUnit, toUnit) {
  var f = fromUnit.toLowerCase()
  var t = toUnit.toLowerCase()

  // Temperatures
  var temp = convertTemperature(val, f, t)
  if (temp) {
    temp.type = "unit"
    return temp
  }

  // Standard ratio-based units
  var tables = [LENGTH_UNITS, MASS_UNITS, TIME_UNITS, DATA_UNITS, VOLUME_UNITS]
  for (var i = 0; i < tables.length; i++) {
    var table = tables[i]
    if (table[f] !== undefined && table[t] !== undefined) {
      var baseVal = val * table[f]
      var result = baseVal / table[t]
      return {
        raw: result,
        formatted: formatNumber(result) + " " + toUnit,
        type: "unit"
      }
    }
  }

  // Currencies
  if (CURRENCY_RATES[f] !== undefined && CURRENCY_RATES[t] !== undefined) {
    var inUsd = val / CURRENCY_RATES[f]
    var currResult = inUsd * CURRENCY_RATES[t]
    return {
      raw: currResult,
      formatted: formatNumber(currResult) + " " + toUnit.toUpperCase(),
      type: "currency"
    }
  }

  return null
}

// ---------------------------------------------------- Expression Evaluator

// Recursive descent parser for safe arithmetic evaluation.
function parseMath(str) {
  var pos = 0
  var s = str

  function peek() {
    while (pos < s.length && s[pos] === " ") pos++
    return pos < s.length ? s[pos] : ""
  }

  function consume(char) {
    if (peek() === char) {
      pos++
      return true
    }
    return false
  }

  function isModuloAtCurrent() {
    // If '%' is followed by a number or expression, it's a binary modulo operator.
    if (s[pos] !== "%") return false
    var next = pos + 1
    while (next < s.length && s[next] === " ") next++
    if (next < s.length) {
      var c = s[next]
      if ((c >= "0" && c <= "9") || c === "(" || c === "+" || c === "-" || (c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) {
        return true
      }
    }
    return false
  }

  function parseExpression() {
    return parseAdditive()
  }

  function parseAdditive() {
    var left = parseMultiplicative()
    while (true) {
      var op = peek()
      if (op === "+" || op === "-") {
        pos++
        var isSub = (op === "-")
        var rightNode = parseMultiplicativeWithPct()
        if (rightNode.isPercent) {
          // X + Y% -> X * (1 + Y/100)
          var pctVal = left * (rightNode.value / 100)
          left = isSub ? left - pctVal : left + pctVal
        } else {
          left = isSub ? left - rightNode.value : left + rightNode.value
        }
      } else {
        break
      }
    }
    return left
  }

  function parseMultiplicativeWithPct() {
    var val = parseMultiplicative()
    // Check if immediately followed by postfix percent (and not modulo)
    if (peek() === "%" && !isModuloAtCurrent()) {
      pos++
      return { value: val, isPercent: true }
    }
    return { value: val, isPercent: false }
  }

  function parseMultiplicative() {
    var left = parseExponential()
    while (true) {
      var c = peek()
      if (c === "*" || c === "/" || (c === "%" && isModuloAtCurrent()) || c === "x" || c === "×") {
        pos++
        var right = parseExponential()
        if (c === "*") left = left * right
        else if (c === "/") {
          if (right === 0) throw new Error("Division by zero")
          left = left / right
        } else if (c === "%") {
          left = left % right
        } else if (c === "x" || c === "×") {
          left = left * right
        }
      } else {
        break
      }
    }
    return left
  }

  function parseExponential() {
    var left = parseUnary()
    if (peek() === "^") {
      pos++
      var right = parseExponential()
      return Math.pow(left, right)
    }
    if (pos + 1 < s.length && s[pos] === "*" && s[pos + 1] === "*") {
      pos += 2
      var right2 = parseExponential()
      return Math.pow(left, right2)
    }
    return left
  }

  function parseUnary() {
    var c = peek()
    if (c === "+") {
      pos++
      return parseUnary()
    }
    if (c === "-") {
      pos++
      return -parseUnary()
    }
    return parsePrimary()
  }

  function parsePrimary() {
    var c = peek()

    if (consume("(")) {
      var val = parseExpression()
      if (!consume(")")) throw new Error("Mismatched parentheses")
      if (peek() === "%" && !isModuloAtCurrent()) {
        pos++
        val = val / 100
      }
      return val
    }

    // Number literals
    var match = s.slice(pos).match(/^(?:0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i)
    if (match) {
      var numStr = match[0]
      pos += numStr.length
      var num = Number(numStr)
      return num
    }

    // Identifiers: functions & constants
    var idMatch = s.slice(pos).match(/^[a-zA-Z_][a-zA-Z0-9_]*/)
    if (idMatch) {
      var name = idMatch[0].toLowerCase()
      pos += idMatch[0].length

      // Constants
      if (name === "pi") return Math.PI
      if (name === "e") return Math.E
      if (name === "tau") return Math.PI * 2

      // Function calls
      if (consume("(")) {
        var args = []
        if (!consume(")")) {
          while (true) {
            args.push(parseExpression())
            if (consume(",")) continue
            if (consume(")")) break
            throw new Error("Expected ')' or ',' in function call")
          }
        }
        var arg0 = args[0]
        switch (name) {
          case "sqrt": return Math.sqrt(arg0)
          case "cbrt": return Math.cbrt(arg0)
          case "abs": return Math.abs(arg0)
          case "round": return Math.round(arg0)
          case "floor": return Math.floor(arg0)
          case "ceil": return Math.ceil(arg0)
          case "trunc": return Math.trunc(arg0)
          case "sin": return Math.sin(arg0)
          case "cos": return Math.cos(arg0)
          case "tan": return Math.tan(arg0)
          case "asin": return Math.asin(arg0)
          case "acos": return Math.acos(arg0)
          case "atan": return Math.atan(arg0)
          case "log":
          case "log10": return Math.log10(arg0)
          case "ln": return Math.log(arg0)
          case "log2": return Math.log2(arg0)
          case "exp": return Math.exp(arg0)
          case "pow": return Math.pow(arg0, args[1] !== undefined ? args[1] : 2)
          case "min": return Math.min.apply(null, args)
          case "max": return Math.max.apply(null, args)
          default:
            throw new Error("Unknown function: " + name)
        }
      }
    }

    throw new Error("Unexpected token at " + pos)
  }

  var res = parseExpression()
  while (pos < s.length && s[pos] === " ") pos++
  if (pos < s.length) throw new Error("Extra characters after expression")
  return res
}

// ------------------------------------------------------------- Main Evaluator

function evaluate(query) {
  if (!query || typeof query !== "string") return null
  var q = query.trim()
  if (q.length < 2) return null

  // Strip leading '=' if present: "= 42 * 2" -> "42 * 2"
  var forced = false
  if (q.charAt(0) === "=") {
    forced = true
    q = q.slice(1).trim()
    if (!q) return null
  }

  // 1. Base conversion: "255 in hex", "0xff in dec", "15 to bin", "0b1010 in dec"
  var baseMatch = q.match(/^(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+)\s+(?:in|to)\s+(hex|bin|binary|oct|octal|dec|decimal)$/i)
  if (baseMatch) {
    var rawNum = Number(baseMatch[1])
    var targetBase = baseMatch[2]
    var baseRes = convertBase(rawNum, targetBase)
    if (baseRes !== null) {
      return {
        expression: q,
        formatted: baseRes,
        raw: rawNum,
        type: "base"
      }
    }
  }

  // 2. Check for unit/currency conversions:
  // e.g. "5 km in mi", "100 usd to eur", "$100 in eur", "6ft in cm"
  var convMatch = q.match(/^([$€£¥₹₩]?)\s*([\d.]+)\s*([a-zA-Z°]+)?\s+(?:to|in|=|\->)\s+([a-zA-Z°]+)$/i)
  if (convMatch) {
    var sym = convMatch[1]
    var val = parseFloat(convMatch[2])
    var fromUnit = convMatch[3] || (sym ? CURRENCY_SYMBOLS[sym] : "")
    var toUnit = convMatch[4]
    if (!isNaN(val) && fromUnit && toUnit) {
      var conv = convertUnits(val, fromUnit, toUnit)
      if (conv) {
        return {
          expression: q,
          formatted: conv.formatted,
          raw: conv.raw,
          type: conv.type
        }
      }
    }
  }

  // 3. Percentage patterns: "15% of 80", "15 % of 80"
  var pctOfMatch = q.match(/^([\d.]+)\s*%\s+of\s+([\d.]+)$/i)
  if (pctOfMatch) {
    var p = parseFloat(pctOfMatch[1])
    var total = parseFloat(pctOfMatch[2])
    if (!isNaN(p) && !isNaN(total)) {
      var pctRes = (p / 100) * total
      return {
        expression: q,
        formatted: formatNumber(pctRes),
        raw: pctRes,
        type: "percentage"
      }
    }
  }

  // 4. Percentage proportion: "20 in % of 80" or "20 as % of 80"
  var pctPropMatch = q.match(/^([\d.]+)\s+(?:in|as)\s+%\s+of\s+([\d.]+)$/i)
  if (pctPropMatch) {
    var num = parseFloat(pctPropMatch[1])
    var den = parseFloat(pctPropMatch[2])
    if (!isNaN(num) && !isNaN(den) && den !== 0) {
      var propRes = (num / den) * 100
      return {
        expression: q,
        formatted: formatNumber(propRes) + "%",
        raw: propRes,
        type: "percentage"
      }
    }
  }

  // Single number check: if not forced, single isolated numbers (e.g. "42", "-5")
  // are ignored so they don't hijack app/setting searches.
  var isSingleNumber = /^[+-]?(?:0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/i.test(q)
  if (!forced && isSingleNumber) {
    return null
  }

  // 5. Intent detection for general math expressions:
  // Must contain an operator (+, -, *, /, ^, %, x), math function call, or start with '='.
  var hasOperator = /[+\-*\/^%×]|\s+x\s+/i.test(q)
  var hasFunction = /^(?:sqrt|cbrt|abs|round|floor|ceil|sin|cos|tan|log|ln|exp)\s*\(/i.test(q)

  if (!forced && !hasOperator && !hasFunction) {
    return null
  }

  // Avoid triggering on non-math search queries that happen to have hyphens or slashes
  // e.g. "system-settings", "/usr/bin/cat", "--version", "node -v", "ctrl-c"
  if (!forced && !hasFunction) {
    // If it looks like a path or unix flag, ignore
    if (/^\/|\s-[a-zA-Z]|\s--[a-zA-Z]/.test(q)) return null
    // If it contains letters that aren't 'e' (scientific), 'x' (times/hex), or constants, ignore
    var nonMathLetters = q.replace(/0x[0-9a-f]+/gi, "")
      .replace(/\b(?:pi|tau|e)\b/gi, "")
      .replace(/\s+[x×]\s+/gi, "")
    if (/[a-wy-z]/i.test(nonMathLetters)) return null
  }

  try {
    var result = parseMath(q)
    if (typeof result === "number" && isFinite(result)) {
      return {
        expression: q,
        formatted: formatNumber(result),
        raw: cleanFloat(result),
        type: "number"
      }
    }
  } catch (e) {
    // Parse error: return null (don't break launcher search)
  }

  return null
}

if (typeof module !== "undefined") {
  module.exports = {
    evaluate: evaluate,
    formatNumber: formatNumber,
    convertUnits: convertUnits,
    parseMath: parseMath
  }
}
