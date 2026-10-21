const test = require("node:test")
const assert = require("node:assert/strict")
const Ranker = require("../plugin/core/Ranker.js")
const Frecency = require("../plugin/core/Frecency.js")
const OmarchyMenu = require("../plugin/core/OmarchyMenu.js")
const Calculator = require("../plugin/core/Calculator.js")
const RS = require("../plugin/core/RootSearch.js")

const deps = { Ranker, Frecency, OmarchyMenu, Calculator }
const NOW = Date.UTC(2026, 9, 19, 12)
const CURRENCY = { rates: { USD: 1, EUR: 0.8 }, source: "ECB via Frankfurter", date: "2026-10-19", stale: false }

const apps = ["firefox", "chromium", "signal-desktop", "org.gnome.Nautilus", "Alacritty", "libreoffice-writer"].map((id) => ({
  id,
  name: { firefox: "Firefox", chromium: "Chromium", "signal-desktop": "Signal", "org.gnome.Nautilus": "Files", Alacritty: "Alacritty", "libreoffice-writer": "LibreOffice Writer" }[id],
  genericName: { firefox: "Web Browser", chromium: "Web Browser", "org.gnome.Nautilus": "File Manager" }[id] || "",
  keywords: [],
  icon: id
}))

const menu = OmarchyMenu.buildTree(OmarchyMenu.parse(`{
  "system": {"label":"System"},
  "system.lock": {"icon":"l","label":"Lock","action":"omarchy-system-lock"},
  "system.shutdown": {"label":"Shutdown","action":"omarchy-system shutdown"},
  "trigger": {"label":"Trigger"},
  "trigger.toggle": {"label":"Toggle"},
  "trigger.toggle.nightlight": {"label":"Nightlight","action":"omarchy-toggle-nightlight"},
  "style": {"label":"Style"},
  "style.font": {"label":"Font","provider":"fonts"}
}`).items, [])

function candidates(guards, providerItems) {
  return apps.map(RS.appCandidate)
    .concat(RS.menuCandidates(menu, guards || { when: {}, checked: {}, disabled: {} }, providerItems || {}, deps))
    .concat(RS.BUILTINS.map(RS.builtinCandidate))
}

function ctx(extra) {
  return Object.assign({ commands: {}, frecency: {}, nowMs: NOW, sensitivity: "medium" }, extra || {})
}

const titles = (section) => section.rows.map((r) => r.candidate.title)
const results = (query, c) => RS.rootSections(candidates(), query, c || ctx(), deps)

test("fir finds Firefox first (Phase 1 accept)", () => {
  const sections = results("fir")
  assert.equal(sections[0].id, "results")
  assert.equal(titles(sections[0])[0], "Firefox")
})

test("a query always ends with the fallback section", () => {
  const sections = results("zzzz-nothing")
  assert.equal(sections.length, 1)
  assert.equal(sections[0].id, "fallback-commands")
  assert.equal(sections[0].title, "Use “zzzz-nothing” with…")
  assert.deepEqual(titles(sections[0]), ["Search Google", "Search DuckDuckGo"])
})

test("an exact alias puts its command on top (Phase 1 accept)", () => {
  const c = ctx({ commands: { "app:chromium": { alias: "ff" } } })
  assert.equal(titles(results("ff", c)[0])[0], "Chromium")
  assert.equal(titles(results("f", c)[0])[0], "Chromium", "an alias prefix also wins over title scores")
})

test("launching bumps frecency and teaches the query (Phase 1 accept)", () => {
  // Chromium and Signal tie for "i" on title score alone; a launch decides it.
  const before = titles(results("web")[0])
  assert.deepEqual(before.slice(0, 2), ["Chromium", "Firefox"])
  const visit = Frecency.recordVisit(null, NOW - 1000, "web")
  const c = ctx({ frecency: { "app:firefox": visit } })
  assert.deepEqual(titles(results("web", c)[0]).slice(0, 2), ["Firefox", "Chromium"])
})

test("deep Omarchy items only appear while searching, with breadcrumbs", () => {
  const empty = results("")
  const all = empty.flatMap((s) => s.rows.map((r) => r.candidate.title))
  assert.ok(all.includes("System") && all.includes("Trigger"))
  assert.ok(!all.includes("Nightlight"))
  const night = results("nightlight")[0].rows[0].candidate
  assert.equal(night.title, "Nightlight")
  assert.equal(night.subtitle, "Trigger › Toggle")
  assert.equal(night.kind, "omarchy-action")
})

test("empty root: favorites, suggestions, commands, applications", () => {
  const c = ctx({
    commands: { "omarchy:system.lock": { favoriteOrder: 0 } },
    frecency: { "app:signal-desktop": Frecency.recordVisit(null, NOW - 1000, "") }
  })
  const sections = results("", c)
  assert.deepEqual(sections.map((s) => s.id), ["favorites", "suggestions", "commands", "apps"])
  assert.deepEqual(titles(sections[0]), ["Lock"])
  assert.deepEqual(titles(sections[1]), ["Signal"])
  assert.ok(!titles(sections[3]).includes("Signal"), "suggested apps are not repeated")
})

test("hidden menu rows (when: false) and disabled commands are left out", () => {
  const sections = RS.rootSections(candidates({ when: { "system.shutdown": false }, checked: {}, disabled: {} }), "shutdown", ctx(), deps)
  assert.equal(sections[0].id, "fallback-commands")
  const off = results("signal", ctx({ commands: { "app:signal-desktop": { enabled: false } } }))
  assert.ok(!off.some((s) => s.id === "results" && titles(s).includes("Signal")))
})

test("a submenu lists its children, and searches its descendants", () => {
  const children = RS.submenuSections(candidates(), "trigger", "", ctx(), deps)
  assert.deepEqual(titles(children[0]), ["Toggle"])
  const found = RS.submenuSections(candidates(), "trigger", "night", ctx(), deps)
  assert.deepEqual(titles(found[0]), ["Nightlight"])
})

test("provider rows are searchable under their menu", () => {
  const rows = OmarchyMenu.providerItems("style.font", "fonts", "Iosevka\tIosevka\tIosevka\n")
  const sections = RS.rootSections(candidates(null, { "style.font": rows }), "iosevka", ctx(), deps)
  const hit = sections[0].rows[0].candidate
  assert.equal(hit.title, "Iosevka")
  assert.equal(hit.subtitle, "Style › Font")
  assert.equal(hit.checked, true)
})

test("actions: primary first, favourites and alias offered", () => {
  const app = RS.decorate(RS.appCandidate(apps[0]), ctx(), deps)
  const ids = RS.actionsFor(app).map((a) => a.id)
  assert.equal(ids[0], "open")
  assert.ok(ids.includes("favorite-add") && ids.includes("set-alias") && ids.includes("copy-id"))
  const menuItem = RS.decorate(candidates().find((c) => c.id === "omarchy:system.lock"), ctx(), deps)
  assert.deepEqual(RS.actionsFor(menuItem).slice(0, 2).map((a) => a.id), ["open", "open-in-omarchy-menu"])
})

test("favourite reordering", () => {
  const cmds = { a: { favoriteOrder: 0 }, b: { favoriteOrder: 1 }, c: {} }
  assert.deepEqual(RS.reorderFavorites(cmds, "c", "favorite-add"), { a: 0, b: 1, c: 2 })
  assert.deepEqual(RS.reorderFavorites(cmds, "b", "favorite-up"), { b: 0, a: 1 })
  assert.deepEqual(RS.reorderFavorites(cmds, "a", "favorite-remove"), { a: null, b: 0 })
})

test("fallback URLs encode the query", () => {
  assert.equal(RS.fallbackUrl(RS.FALLBACKS[0], " a&b c "), "https://www.google.com/search?q=a%26b%20c")
})

test("calculator shows at the top of results for math expressions (Phase 2 accept)", () => {
  const sections = results("2+2")
  assert.equal(sections[0].id, "calculator")
  assert.equal(sections[0].rows[0].candidate.title, "= 4")
  assert.equal(sections[0].rows[0].candidate.result, "4")
  assert.equal(sections[0].rows[0].candidate.typeLabel, "Calculator")

  const unitSections = results("5 km in mi")
  assert.equal(unitSections[0].id, "calculator")
  assert.equal(unitSections[0].rows[0].candidate.title, "= 3.10685596119 mi")

  const currSections = results("100 usd in eur", ctx({ currency: CURRENCY }))
  assert.equal(currSections[0].id, "calculator")
  assert.equal(currSections[0].rows[0].candidate.title, "= 80 EUR")
  assert.equal(currSections[0].rows[0].candidate.rateDate, CURRENCY.date)
  assert.equal(currSections[0].rows[0].candidate.rateSource, CURRENCY.source)
  assert.equal(currSections[0].rows[0].candidate.typeLabel, "2026-10-19")
  assert.match(currSections[0].rows[0].candidate.subtitle, /ECB via Frankfurter/)
  const stale = results("100 usd in eur", ctx({ currency: { ...CURRENCY, stale: true } }))[0].rows[0].candidate
  assert.equal(stale.title, "= 80 EUR")
  assert.equal(stale.typeLabel, "Stale · 2026-10-19")
})

test("calculator row actions", () => {
  const calcCandidate = {
    id: "calc:2+2",
    kind: "calculator",
    result: "4",
    expression: "2+2"
  }
  const actions = RS.actionsFor(calcCandidate)
  assert.equal(actions[0].id, "copy-result")
  assert.equal(actions[0].shortcut, "↵")
  assert.equal(actions[1].id, "copy-equation")
  assert.equal(actions[1].shortcut, "Ctrl ↵")
  assert.equal(actions[2].id, "copy-raw")
  assert.equal(actions[2].shortcut, "Ctrl Shift C")
})

test("unavailable rates have no copy actions and never display undefined", () => {
  for (const query of ["100 usd in eur", "1 btc in usd", "1 eth in eur"]) {
    const sections = results(query)
    const row = sections[0].rows[0].candidate
    assert.equal(sections[0].id, "calculator")
    assert.ok(row.calculatorError)
    assert.equal(row.disabled, true)
    assert.equal(row.rawResult, undefined)
    assert.ok(!row.title.includes("undefined"))
    assert.deepEqual(RS.actionsFor(row), [])
    assert.equal(sections.at(-1).id, "fallback-commands")
  }
})

test("rate updates recompute the same currency row without affecting other providers", () => {
  const before = results("100 usd in eur", ctx({ currency: CURRENCY }))
  const after = results("100 usd in eur", ctx({ currency: { ...CURRENCY, rates: { USD: 1, EUR: 0.6 } } }))
  assert.equal(before[0].rows[0].candidate.id, after[0].rows[0].candidate.id)
  assert.equal(after[0].rows[0].candidate.result, "60 EUR")
  assert.deepEqual(before.at(-1), after.at(-1))
  assert.equal(results("2+2")[0].rows[0].candidate.result, "4")
  assert.ok(!results("firefox").some(s => s.id === "calculator"))
  assert.ok(!results("42").some(s => s.id === "calculator"))
})

test("invalid expressions never hijack search and calculator stays out of submenus", () => {
  for (const query of ["1..5 km in m", "15..5% of 80", "--version", "/usr/bin/cat", "sqrt(-1)"]) assert.ok(!results(query).some(s => s.id === "calculator"), query)
  assert.ok(!RS.submenuSections(candidates(), "system", "2+2", ctx(), deps).some(s => s.id === "calculator"))
})
