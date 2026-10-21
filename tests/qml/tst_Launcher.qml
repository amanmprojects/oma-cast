import QtQuick
import QtTest
import "../../plugin/ui" as LauncherUi
import "../../plugin/core/Calculator.js" as Calculator
import "../../plugin/core/RootSearch.js" as RootSearch
import "../../plugin/core/Ranker.js" as Ranker
import "../../plugin/core/Frecency.js" as Frecency

TestCase {
  id: testCase
  name: "LauncherCalculatorActions"
  when: false

  Component.onCompleted: Qt.callLater(function() {
    testCase.when = true
    testCase.qtest_run()
    console.info("SERVICE_TEST_RESULT " + JSON.stringify({ passed: testCase.qtest_results.passCount, failed: testCase.qtest_results.failCount, completed: testCase.completed }))
    Qt.quit()
  })

  property string copiedText: ""
  property var currency: ({ rates: { USD: 1, EUR: 0.8 }, source: "ECB via Frankfurter", date: "2026-10-19", stale: false })
  property var deps: ({ Calculator: Calculator, Ranker: Ranker, Frecency: Frecency })

  QtObject {
    id: fakeBackend
    property bool ready: true
    property bool loading: false
    property int storeRevision: 0
    property int candidatesRevision: 0
    property int currencyRevision: 0
    property var config: ({ keepVisibleOnFocusLoss: false })

    function callSync(method, data) {
      if (method === "settings.getGeneralSettings") return { ok: true, data: { uiZoom: 1, windowMode: "expanded", popToRootTimeout: 90, escapeKeyBehavior: "pop-back-or-close" } }
      if (method === "rootSearch.search") {
        var sections = RootSearch.rootSections([], data.query, { commands: {}, frecency: {}, nowMs: Date.now(), currency: testCase.currency }, testCase.deps)
        return { ok: true, data: sections.map(function(s) { return { title: s.title, id: s.id, rows: s.rows.map(function(r) { return r.candidate }) } }) }
      }
      if (method === "rootSearch.getActions") {
        var expression = data.id.slice(5)
        var result = Calculator.evaluate(expression, testCase.currency)
        return { ok: true, data: result ? RootSearch.actionsFor(RootSearch.calculatorCandidate(expression, result)) : [] }
      }
      if (method === "rootSearch.performAction") {
        try {
          testCase.copiedText = Calculator.copyText(Calculator.evaluate(data.id.slice(5), testCase.currency), data.action)
          return { ok: true, data: { close: true } }
        } catch (e) { return { ok: false, error: String(e) } }
      }
      return { ok: false, error: "Unexpected test method " + method }
    }
  }

  Component {
    id: windowComponent
    LauncherUi.LauncherWindow { backend: fakeBackend; shown: false }
  }

  function makeWindow(query) {
    var window = createTemporaryObject(windowComponent, testCase)
    verify(window !== null)
    window.prepare({ query: query })
    verify(window.selectedRow !== null)
    compare(window.selectedRow.itemId, "calc:" + query)
    return window
  }

  function init() { copiedText = "" }

  function test_copyShortcuts_data() {
    return [
      { tag: "enter", key: Qt.Key_Return, modifiers: Qt.NoModifier, expected: "80 EUR" },
      { tag: "ctrl-enter", key: Qt.Key_Return, modifiers: Qt.ControlModifier, expected: "100 usd in eur = 80 EUR" },
      { tag: "ctrl-shift-c", key: Qt.Key_C, modifiers: Qt.ControlModifier | Qt.ShiftModifier, expected: "80" },
      { tag: "ctrl-shift-enter", key: Qt.Key_Return, modifiers: Qt.ControlModifier | Qt.ShiftModifier, expected: "80" },
      { tag: "ctrl-1", key: Qt.Key_1, modifiers: Qt.ControlModifier, expected: "80 EUR" }
    ]
  }

  function test_copyShortcuts(data) {
    var window = makeWindow("100 usd in eur")
    verify(window.handleKey({ key: data.key, modifiers: data.modifiers, text: "" }))
    compare(copiedText, data.expected)
    compare(window.query, "")
  }

  function test_actionPanel() {
    var window = makeWindow("2+2")
    verify(window.handleKey({ key: Qt.Key_K, modifiers: Qt.ControlModifier, text: "" }))
    compare(window.actionPanelOpen, true)
    compare(window.actions.length, 3)
    compare(window.actions[2].id, "copy-raw")
    window.perform(window.actions[2].id)
    compare(copiedText, "4")
  }

  function test_unavailableRatesCannotCopy() {
    var oldCurrency = currency
    currency = null
    var window = makeWindow("100 usd in eur")
    compare(window.actionsForSelected().length, 0)
    verify(window.handleKey({ key: Qt.Key_C, modifiers: Qt.ControlModifier | Qt.ShiftModifier, text: "" }))
    compare(copiedText, "")
    verify(window.selectedRow.disabled)
    currency = oldCurrency
  }
}
