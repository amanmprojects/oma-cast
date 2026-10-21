import QtQuick
import QtTest
import Quickshell
import Quickshell.Io
import "../../plugin/services" as Services
import "../../plugin/core/ExchangeRates.js" as Policy

TestCase {
  id: testCase
  name: "CurrencyRatesLifecycle"
  when: false

  Component.onCompleted: Qt.callLater(function() {
    testCase.when = true
    testCase.qtest_run()
    console.info("SERVICE_TEST_RESULT " + JSON.stringify({ passed: testCase.qtest_results.passCount, failed: testCase.qtest_results.failCount, completed: testCase.completed }))
    Qt.quit()
  })

  property double currentTime: Date.UTC(2026, 9, 21, 12)
  property var requests: []
  property int failuresBefore: 0

  function fakeRequest() {
    var request = {
      readyState: 0, status: 0, responseText: "", responseURL: Policy.ENDPOINT,
      aborted: false, method: "", url: "", async: false,
      open: function(method, url, async) { this.method = method; this.url = url; this.async = async },
      setRequestHeader: function(name, value) { this.header = name + ": " + value },
      send: function() { this.sent = true },
      abort: function() { this.aborted = true; this.readyState = 0; if (this.onreadystatechange) this.onreadystatechange() }
    }
    testCase.requests.push(request)
    return request
  }

  function response(date, rate) {
    return JSON.stringify({ base: "USD", amount: 1, date: date || "2026-10-20", rates: { EUR: rate || 0.8 } })
  }

  function deliver(request, body, status) {
    request.status = status === undefined ? 200 : status
    request.responseText = body
    request.readyState = XMLHttpRequest.DONE
    request.onreadystatechange()
  }

  Component {
    id: serviceComponent
    Services.CurrencyRates {
      path: ""
      now: function() { return testCase.currentTime }
      requestFactory: function() { return testCase.fakeRequest() }
      timeoutMs: 1000
    }
  }

  function makeService() {
    var service = createTemporaryObject(serviceComponent, testCase)
    verify(service !== null)
    service.ready = true
    service.cacheReady = true
    // Most lifecycle tests are memory-only; the FileView test checks persistence.
    service.cacheReadOnly = true
    return service
  }

  function init() {
    failuresBefore = testCase.qtest_results.failCount
    currentTime = Date.UTC(2026, 9, 21, 12)
    requests = []
  }

  function cleanup() {
    if (testCase.qtest_results.failCount > failuresBefore) console.error("SERVICE_TEST_FAILURE " + testCase.qtest_results.functionName)
  }

  function test_successAndDeduplication() {
    var service = makeService()
    verify(service.refresh(false).started)
    compare(requests.length, 1)
    compare(service.loading, true)
    compare(service.refresh(true).started, false)
    var request = requests[0]
    compare(request.method, "GET")
    compare(request.url, Policy.ENDPOINT)
    compare(request.async, true)
    compare(request.header, "Accept: application/json")
    deliver(request, response())
    compare(service.loading, false)
    compare(service.snapshot.date, "2026-10-20")
    compare(service.rateContext().rates.EUR, 0.8)
    compare(service.lastError, "")
    compare(service.refresh(false).started, false)
    compare(service.refresh(true).started, false)
    currentTime += Policy.MIN_REFRESH_MS
    compare(service.refresh(true).started, true)
    deliver(requests[1], response("2026-10-20", 0.6))
    compare(service.rateContext().rates.EUR, 0.6)
  }

  function test_invalidResponsesKeepLastGoodRates_data() {
    return [
      { tag: "http", status: 503, body: response(), url: Policy.ENDPOINT },
      { tag: "bad-json", status: 200, body: "<html>error</html>", url: Policy.ENDPOINT },
      { tag: "zero-rate", status: 200, body: '{"base":"USD","amount":1,"date":"2026-10-20","rates":{"EUR":0}}', url: Policy.ENDPOINT },
      { tag: "older-date", status: 200, body: response("2026-10-19"), url: Policy.ENDPOINT },
      { tag: "foreign-redirect", status: 200, body: response(), url: "https://example.invalid/v1/latest" },
      { tag: "oversized", status: 200, body: new Array(Policy.MAX_RESPONSE_BYTES + 2).join(" "), url: Policy.ENDPOINT }
    ]
  }

  function test_invalidResponsesKeepLastGoodRates(data) {
    var service = makeService()
    service.snapshot = Policy.snapshotFromResponse(JSON.parse(response()), currentTime).snapshot
    verify(service.refresh(true).started)
    requests[0].responseURL = data.url
    deliver(requests[0], data.body, data.status)
    compare(service.loading, false)
    compare(service.snapshot.rates.EUR, 0.8)
    verify(service.lastError.length > 0)
    currentTime += Policy.RETRY_MS - 1
    compare(service.refresh(true).started, false)
    currentTime += 1
    verify(service.refresh(true).started)
    deliver(requests[1], response())
    compare(service.lastError, "")
  }

  function test_timeoutAndLateCompletion() {
    var service = makeService()
    service.timeoutMs = 10
    verify(service.refresh(true).started)
    var request = requests[0]
    var lateCallback = request.onreadystatechange
    tryCompare(service, "loading", false, 200)
    compare(request.aborted, true)
    verify(service.lastError.indexOf("timed out") >= 0)
    request.readyState = XMLHttpRequest.DONE
    request.status = 200
    request.responseText = response()
    lateCallback()
    compare(service.snapshot, null)
    currentTime += Policy.RETRY_MS
    verify(service.refresh(true).started)
    lateCallback()
    compare(service.loading, true)
    deliver(requests[1], response())
    compare(service.snapshot.rates.EUR, 0.8)
  }

  function test_invalidCacheAndExternalRecovery() {
    var service = makeService()
    service.ingest("{broken")
    compare(service.cacheReadOnly, true)
    verify(service.lastError.length > 0)
    verify(service.refresh(true).started)
    deliver(requests[0], response())
    compare(service.snapshot.rates.EUR, 0.8)
    compare(service.cacheReadOnly, true)
    var cached = Policy.snapshotFromResponse(JSON.parse(response()), currentTime).snapshot
    service.ingest(JSON.stringify(cached))
    compare(service.cacheReadOnly, false)
    compare(service.lastError, "")
    var old = Policy.snapshotFromResponse(JSON.parse(response("2026-10-19", 0.5)), currentTime - Policy.TTL_MS).snapshot
    service.ingest(JSON.stringify(old))
    compare(service.snapshot.rates.EUR, 0.8)
  }

  function test_fileCacheRoundTripAndRecovery() {
    var cachePath = Quickshell.env("OMA_CAST_TEST_CACHE")
    verify(cachePath.length > 0)
    var service = createTemporaryObject(serviceComponent, testCase, { path: cachePath })
    verify(service !== null)
    service.ready = true
    tryCompare(service, "cacheReady", true, 1000)
    tryCompare(service, "loading", true, 1000)
    compare(requests.length, 1)
    deliver(requests[0], response())
    var file = createTemporaryObject(fileComponent, testCase, { path: cachePath })
    tryVerify(function() { file.reload(); return file.text().indexOf('"date": "2026-10-20"') >= 0 }, 2000)
    compare(JSON.parse(file.text()).rates.EUR, 0.8)

    var before = requests.length
    var second = createTemporaryObject(serviceComponent, testCase, { path: cachePath, ready: true })
    tryCompare(second, "cacheReady", true, 1000)
    compare(second.snapshot.rates.EUR, 0.8)
    compare(requests.length, before)

    file.setText("{broken")
    tryCompare(service, "cacheReadOnly", true, 2000)
    currentTime += Policy.MIN_REFRESH_MS
    verify(service.refresh(true).started)
    deliver(requests[requests.length - 1], response("2026-10-20", 0.6))
    file.reload()
    compare(file.text(), "{broken")
    compare(service.snapshot.rates.EUR, 0.6)

    file.setText(JSON.stringify(service.snapshot))
    tryCompare(service, "cacheReadOnly", false, 2000)
    compare(service.lastError, "")
  }

  Component {
    id: fileComponent
    FileView { watchChanges: true; atomicWrites: true; printErrors: false }
  }

  function test_requestSetupFailure() {
    var service = makeService()
    service.requestFactory = function() {
      var request = testCase.fakeRequest()
      request.send = function() { throw new Error("test send failed") }
      return request
    }
    compare(service.refresh(true).started, false)
    compare(service.loading, false)
    compare(requests[0].aborted, true)
    verify(service.lastError.indexOf("test send failed") >= 0)
    compare(service.refresh(true).started, false)
  }

  function test_cacheWriteFailureKeepsMemorySnapshot() {
    var cachePath = Quickshell.env("OMA_CAST_TEST_FAIL_CACHE")
    verify(cachePath.length > 0)
    var service = createTemporaryObject(serviceComponent, testCase, { path: cachePath, ready: true })
    verify(service !== null)
    tryCompare(service, "loading", true, 1000)
    deliver(requests[0], response())
    tryVerify(function() { return service.lastError.indexOf("Cannot write currency cache") >= 0 }, 2000)
    compare(service.snapshot.rates.EUR, 0.8)
    compare(service.loading, false)
    compare(service.refresh(false).started, false)
  }

  function test_destructionAbortsRequest() {
    var service = serviceComponent.createObject(testCase)
    verify(service !== null)
    service.ready = true
    service.cacheReady = true
    service.cacheReadOnly = true
    verify(service.refresh(true).started)
    var request = requests[0]
    service.destroy()
    wait(0)
    compare(request.aborted, true)
  }

  function test_readinessAndDestructionCancelSafely() {
    var service = makeService()
    service.cacheReady = false
    compare(service.refresh(true).started, false)
    service.cacheReady = true
    verify(service.refresh(true).started)
    var request = requests[0]
    service.ready = false
    compare(request.aborted, true)
    compare(service.loading, false)
  }
}
