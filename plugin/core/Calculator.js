// Calculator engine (SPEC §8.1 P0, §12 Phase 2).
//
// Evaluates math expressions, percentages, units and currency conversions,
// and base conversions (hex/bin/oct) safely without eval().
//
// Designed to run in both Node.js (unit tests) and Quickshell's QML JS runtime.

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

// Currency codes, not rates. Rates are injected from the dated cache (SPEC §8.1).
var FIAT_CURRENCIES = "AUD BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS INR ISK JPY KRW MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR".split(" ")

var CURRENCY_SYMBOLS = {
  $: "usd",
  "€": "eur",
  "£": "gbp",
  "¥": "jpy",
  "₹": "inr",
  "₩": "krw"
}

// ------------------------------------------------------------- Number display

function formatNumber(n) {
  if (!isFinite(n)) return String(n)
  // [D] Display 12 significant digits for fractions; never round raw results
  // or exactly representable integers. Format only the mantissa, not exponent.
  var text = String(Number.isInteger(n) ? n : Number(n.toPrecision(12)))
  var exponentAt = text.search(/e/i)
  var exponent = exponentAt >= 0 ? text.slice(exponentAt) : ""
  var parts = (exponentAt >= 0 ? text.slice(0, exponentAt) : text).split(".")
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return parts.join(".") + exponent
}

// -------------------------------------------------------- Base conversions

function convertBase(val, targetBase) {
  // [D] Reject fractions and unsafe integers instead of silently truncating or
  // rounding them. QML has no BigInt, so exact bases are bounded by JS numbers.
  if (!Number.isSafeInteger(val)) return null
  var n = val
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

function convertUnits(val, fromUnit, toUnit, currency) {
  if (typeof val !== "number" || !isFinite(val)) return null
  var f = fromUnit.toLowerCase().replace(/^°/, "")
  var t = toUnit.toLowerCase().replace(/^°/, "")

  var temp = convertTemperature(val, f, t)
  if (temp && isFinite(temp.raw)) {
    temp.type = "unit"
    return temp
  }

  // Standard ratio-based units. Months/years are Julian averages; volume
  // measures (gallon, pint, cup) are US units. [D]
  var tables = [LENGTH_UNITS, MASS_UNITS, TIME_UNITS, DATA_UNITS, VOLUME_UNITS]
  for (var i = 0; i < tables.length; i++) {
    var table = tables[i]
    if (Object.prototype.hasOwnProperty.call(table, f) && Object.prototype.hasOwnProperty.call(table, t)) {
      var result = val * (table[f] / table[t])
      if (!isFinite(result)) return null
      return { raw: result, formatted: formatNumber(result) + " " + toUnit, type: "unit" }
    }
  }

  var fromCode = f.toUpperCase()
  var toCode = t.toUpperCase()
  var fromFiat = FIAT_CURRENCIES.indexOf(fromCode) >= 0
  var toFiat = FIAT_CURRENCIES.indexOf(toCode) >= 0
  var crypto = fromCode === "BTC" || fromCode === "ETH" || toCode === "BTC" || toCode === "ETH"
  if (!fromFiat && !toFiat && !crypto) return null

  var rates = currency && currency.rates
  var metadata = {
    type: "currency",
    rateSource: currency && currency.source || "ECB via Frankfurter",
    rateDate: currency && currency.date || "",
    stale: !!(currency && currency.stale)
  }
  if (!fromFiat || !toFiat) {
    metadata.error = "Unsupported currency: " + (!fromFiat ? fromCode : toCode)
  } else if (!rates || !Object.prototype.hasOwnProperty.call(rates, fromCode) || !Object.prototype.hasOwnProperty.call(rates, toCode)
      || typeof rates[fromCode] !== "number" || !(rates[fromCode] > 0) || !isFinite(rates[fromCode])
      || typeof rates[toCode] !== "number" || !(rates[toCode] > 0) || !isFinite(rates[toCode])) {
    metadata.error = currency && currency.loading ? "Currency rates are loading…" : "Currency rates unavailable"
  } else {
    var currResult = val * (rates[toCode] / rates[fromCode])
    if (!isFinite(currResult)) return null
    metadata.raw = currResult
    metadata.formatted = formatNumber(currResult) + " " + toCode
  }
  return metadata
}

// ---------------------------------------------------- Expression Evaluator

var NUMBER_LITERAL = "(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?"
var CONSTANTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 }
var UNARY_FUNCTIONS = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round,
  floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  log: Math.log10, log10: Math.log10, ln: Math.log, log2: Math.log2, exp: Math.exp
}

function knownFunction(name) {
  return Object.prototype.hasOwnProperty.call(UNARY_FUNCTIONS, name) || name === "pow" || name === "min" || name === "max"
}

// [D] Limits protect the shell's shared QML thread from unbounded input.
function tokenize(str) {
  if (str.length > 1024) throw new Error("Expression is too long")
  var tokens = []
  var pos = 0
  var numeric = new RegExp("^(?:0x[0-9a-f]+|0b[01]+|0o[0-7]+|" + NUMBER_LITERAL + ")", "i")
  while (pos < str.length) {
    if (/\s/.test(str.charAt(pos))) { pos++; continue }
    var rest = str.slice(pos)
    var number = rest.match(numeric)
    if (number) {
      var value = Number(number[0])
      if (!isFinite(value)) throw new Error("Number is out of range")
      tokens.push({ kind: "number", text: number[0], value: value })
      pos += number[0].length
    } else if (str.charAt(pos) === "x" && tokens.length > 0 && /[\da-zA-Z.(]/.test(str.charAt(pos + 1))) {
      tokens.push({ kind: "operator", text: "*" })
      pos++
    } else {
      var identifier = rest.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)
      if (identifier) {
        var name = identifier[0].toLowerCase()
        tokens.push({ kind: name === "x" ? "operator" : "identifier", text: name === "x" ? "*" : name })
        pos += identifier[0].length
      } else {
        var op = str.charAt(pos)
        if (op === "*" && str.charAt(pos + 1) === "*") { op = "^"; pos++ }
        if ("+-*/^%(),×÷".indexOf(op) < 0) throw new Error("Unexpected token at " + pos)
        tokens.push({ kind: "operator", text: op === "×" ? "*" : (op === "÷" ? "/" : op) })
        pos++
      }
    }
    if (tokens.length > 256) throw new Error("Too many tokens")
  }
  return tokens
}

// Recursive descent; the same strict tokens drive root-search intent.
function parseTokens(tokens) {
  var pos = 0
  var depth = 0
  function peek() { return pos < tokens.length ? tokens[pos].text : "" }
  function consume(text) { if (peek() !== text) return false; pos++; return true }
  function node(value, percent) {
    if (!isFinite(value)) throw new Error("Result is out of range")
    return { value: value, percent: !!percent }
  }
  function modulo() {
    if (peek() !== "%" || pos + 1 >= tokens.length) return false
    var next = tokens[pos + 1]
    // [D] A following + or - starts addition/subtraction after a postfix
    // percent. Signed modulo operands require parentheses: 10 % (-3).
    return next.kind === "number" || next.kind === "identifier" || next.text === "("
  }

  function additive() {
    var left = multiplicative()
    while (peek() === "+" || peek() === "-") {
      var subtract = consume("-")
      if (!subtract) consume("+")
      var right = multiplicative()
      var amount = right.percent && !left.percent ? left.value * right.value : right.value
      left = node(subtract ? left.value - amount : left.value + amount, left.percent && right.percent)
    }
    return left
  }

  function multiplicative() {
    var left = unary()
    while (peek() === "*" || peek() === "/" || modulo()) {
      var op = peek()
      pos++
      var right = unary()
      if ((op === "/" || op === "%") && right.value === 0) throw new Error("Division by zero")
      if (op === "*") left = node(left.value * right.value, left.percent !== right.percent)
      else if (op === "/") left = node(left.value / right.value, left.percent && !right.percent)
      else left = node(left.value % right.value, false)
    }
    return left
  }

  function unary() {
    if (++depth > 64) throw new Error("Expression is nested too deeply")
    var result
    if (consume("+")) result = unary()
    else if (consume("-")) { result = unary(); result = node(-result.value, result.percent) }
    else result = power()
    depth--
    return result
  }

  function power() {
    var left = primary()
    if (peek() === "%" && !modulo()) { pos++; left = node(left.value / 100, true) }
    if (consume("^")) left = node(Math.pow(left.value, unary().value), false)
    return left
  }

  function primary() {
    if (consume("(")) {
      var value = additive()
      if (!consume(")")) throw new Error("Mismatched parentheses")
      return value
    }
    var token = tokens[pos++]
    if (!token) throw new Error("Expected a number")
    if (token.kind === "number") return node(token.value, false)
    if (token.kind !== "identifier") throw new Error("Unexpected token")
    var name = token.text
    if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) return node(CONSTANTS[name], false)
    if (!knownFunction(name) || !consume("(")) throw new Error("Unknown function: " + name)
    var args = []
    if (!consume(")")) {
      do { args.push(additive().value) } while (consume(","))
      if (!consume(")")) throw new Error("Expected ')' or ','")
    }
    // [D] Trigonometry is in radians; arity errors are not silently ignored.
    if (Object.prototype.hasOwnProperty.call(UNARY_FUNCTIONS, name)) {
      if (args.length !== 1) throw new Error(name + " takes one argument")
      return node(UNARY_FUNCTIONS[name](args[0]), false)
    }
    if (name === "pow") {
      if (args.length !== 2) throw new Error("pow takes two arguments")
      return node(Math.pow(args[0], args[1]), false)
    }
    if (!args.length) throw new Error(name + " needs an argument")
    return node((name === "min" ? Math.min : Math.max).apply(null, args), false)
  }

  var result = additive().value
  if (pos !== tokens.length) throw new Error("Extra characters after expression")
  if (!isFinite(result)) throw new Error("Result is out of range")
  return result === 0 ? 0 : result
}

function parseMath(str) { return parseTokens(tokenize(str)) }

// ------------------------------------------------------------- Main Evaluator

function evaluate(query, currency, options) {
  if (typeof query !== "string") return null
  var q = query.trim()
  if (!q || q.length > 1024) return null
  var forced = !!(options && options.force)
  if (q.charAt(0) === "=") {
    forced = true
    q = q.slice(1).trim()
    if (!q) return null
  }

  // Conversions and percentages use whole, signed decimal/scientific tokens:
  // parseFloat must never turn a malformed amount (1..5) into a valid value.
  var signed = "[+-]?" + NUMBER_LITERAL
  var baseMatch = q.match(/^([+-]?)(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+)\s+(?:in|to)\s+(hex|bin|binary|oct|octal|dec|decimal)$/i)
  if (baseMatch) {
    var rawNum = Number(baseMatch[2]) * (baseMatch[1] === "-" ? -1 : 1)
    var baseRes = convertBase(rawNum, baseMatch[3])
    return baseRes === null ? null : { expression: q, formatted: baseRes, raw: rawNum, type: "base" }
  }

  var convMatch = q.match(new RegExp("^([+-]?)\\s*([$€£¥₹₩]?)\\s*(" + signed + ")\\s*([a-zA-Z°]+)?\\s+(?:to|in|=|->)\\s+([a-zA-Z°]+)$", "i"))
  if (convMatch) {
    if (convMatch[1] && /^[+-]/.test(convMatch[3])) return null
    var sym = convMatch[2]
    var val = Number(convMatch[3]) * (convMatch[1] === "-" ? -1 : 1)
    var fromUnit = convMatch[4] || (sym ? CURRENCY_SYMBOLS[sym] : "")
    if (sym && convMatch[4] && convMatch[4].toLowerCase() !== CURRENCY_SYMBOLS[sym]) return null
    if (!fromUnit) return null
    var conv = convertUnits(val, fromUnit, convMatch[5], currency)
    if (!conv) return null
    conv.expression = q
    return conv
  }

  var pctOfMatch = q.match(new RegExp("^(" + signed + ")\\s*%\\s+of\\s+(" + signed + ")$", "i"))
  if (pctOfMatch) {
    var pctRes = (Number(pctOfMatch[1]) / 100) * Number(pctOfMatch[2])
    return isFinite(pctRes) ? { expression: q, formatted: formatNumber(pctRes), raw: pctRes, type: "percentage" } : null
  }

  var pctPropMatch = q.match(new RegExp("^(" + signed + ")\\s+(?:in|as)\\s+%\\s+of\\s+(" + signed + ")$", "i"))
  if (pctPropMatch) {
    var den = Number(pctPropMatch[2])
    var num = Number(pctPropMatch[1])
    var propRes = (num / den) * 100
    return isFinite(num) && isFinite(den) && den !== 0 && isFinite(propRes) ? { expression: q, formatted: formatNumber(propRes) + "%", raw: propRes, type: "percentage" } : null
  }

  try {
    var tokens = tokenize(q)
    var intent = forced
    var onlyNumber = tokens.length === 1 && tokens[0].kind === "number"
      || tokens.length === 2 && (tokens[0].text === "+" || tokens[0].text === "-") && tokens[1].kind === "number"
    if (!forced && onlyNumber) return null
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i]
      if (token.kind === "identifier") {
        if (knownFunction(token.text) && tokens[i + 1] && tokens[i + 1].text === "(") intent = true
        else if (!Object.prototype.hasOwnProperty.call(CONSTANTS, token.text)) return null
      } else if ("+-*/^%".indexOf(token.text) >= 0) intent = true
    }
    if (!intent) return null
    var result = parseTokens(tokens)
    return { expression: q, formatted: formatNumber(result), raw: result, type: "number" }
  } catch (e) {
    // Incomplete/invalid input is normal while typing; root search stays usable.
    return null
  }
}

function copyText(result, action) {
  if (!result || result.error || typeof result.formatted !== "string") throw new Error(result && result.error || "No calculator result")
  if (action === "open" || action === "copy-result") return result.formatted
  if (action === "copy-equation") return result.expression + " = " + result.formatted
  if (action === "copy-raw") return String(result.raw)
  throw new Error("Unknown calculator action " + action)
}

if (typeof module !== "undefined") {
  module.exports = {
    evaluate: evaluate,
    formatNumber: formatNumber,
    convertUnits: convertUnits,
    parseMath: parseMath,
    copyText: copyText
  }
}
