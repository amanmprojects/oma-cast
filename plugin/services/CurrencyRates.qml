import QtQuick
import Quickshell.Io
import "../core/ExchangeRates.js" as Policy

// Native asynchronous I/O; calculation always reads the last good snapshot.
Item {
  id: service

  required property string path
  property bool ready: false
  property var now: function() { return Date.now() }
  // [D] Injectable transport/timeout for deterministic QML tests, not a URL override.
  property var requestFactory: function() { return new XMLHttpRequest() }
  property int timeoutMs: 10000

  property var snapshot: null
  property bool cacheReady: false
  property bool cacheReadOnly: false
  property bool loading: false
  readonly property string lastError: service._networkError || service._cacheError
  property int revision: 0

  signal changed()
  signal message(string level, string text, var metadata)

  property var _request: null
  property bool _destroying: false
  property double _lastAttempt: 0
  property double _retryAt: 0
  property string _networkError: ""
  property string _cacheError: ""
  property string _lastWritten: ""
  property bool _lastStale: false

  function rateContext() { return Policy.context(service.snapshot, service.now(), service.loading, service.lastError) }

  function publish() {
    if (service._destroying) return
    service._lastStale = service.rateContext().stale
    service.revision++
    service.changed()
  }

  function ingest(text) {
    if (service._destroying) return
    var parsed = Policy.parseCache(text, service.now())
    service.cacheReadOnly = parsed.readOnly
    service._cacheError = parsed.error
    if (parsed.error) service.message("warning", "currency cache left untouched: " + parsed.error, null)
    if (parsed.snapshot && (!service.snapshot || parsed.snapshot.date > service.snapshot.date
        || parsed.snapshot.date === service.snapshot.date && parsed.snapshot.fetchedAt > service.snapshot.fetchedAt)) {
      service.snapshot = parsed.snapshot
    }
    service.cacheReady = true
    service.publish()
    Qt.callLater(function() { if (!service._destroying) service.refresh(false) })
  }

  function cancelRequest() {
    var request = service._request
    service._request = null
    timeout.stop()
    service.loading = false
    // Aborting fires onreadystatechange; clear identity before calling it.
    if (request) {
      request.onreadystatechange = function() {}
      request.abort()
    }
  }

  function fail(request, text) {
    if (request !== service._request || service._destroying) return
    service._networkError = text
    service._retryAt = service.now() + Policy.RETRY_MS
    service.cancelRequest()
    service.message("warning", text + "; keeping the last good rates", null)
    service.publish()
  }

  function complete(request) {
    if (request !== service._request || service._destroying) return
    if (request.status !== 200) { service.fail(request, "Currency request failed (HTTP " + request.status + ")"); return }
    var finalUrl = request.responseURL
    if (finalUrl && !/^https:\/\/api\.frankfurter\.dev\/v1\/latest(?:\?|$)/.test(finalUrl)) {
      service.fail(request, "Currency request redirected outside the provider")
      return
    }
    var text = request.responseText
    if (typeof text !== "string" || text.length > Policy.MAX_RESPONSE_BYTES) {
      service.fail(request, "Currency response is too large")
      return
    }
    var parsed
    try { parsed = JSON.parse(text) } catch (e) { service.fail(request, "Currency response is not JSON"); return }
    var result = Policy.snapshotFromResponse(parsed, service.now(), service.snapshot)
    if (result.error) { service.fail(request, result.error); return }

    service._request = null
    timeout.stop()
    request.onreadystatechange = function() {}
    service.loading = false
    service._networkError = ""
    service._retryAt = 0
    service.snapshot = result.snapshot
    var serialized
    if (!service.cacheReadOnly) {
      serialized = JSON.stringify(service.snapshot, null, 2) + "\n"
      service._lastWritten = serialized
      file.setText(serialized)
    }
    service.publish()
    service.message("info", "currency rates refreshed", { date: service.snapshot.date, source: Policy.SOURCE })
  }

  function refresh(force) {
    if (!service.ready || !service.cacheReady || service.loading || service._destroying
        || !Policy.needsRefresh(service.snapshot, service.now(), service._lastAttempt, service._retryAt, !!force)) {
      return { started: false, loading: service.loading, date: service.snapshot ? service.snapshot.date : "", error: service.lastError }
    }
    service._lastAttempt = service.now()
    service._networkError = ""
    var request = null
    try {
      request = service.requestFactory()
      service._request = request
      service.loading = true
      service.publish()
      request.onreadystatechange = function() {
        if (request === service._request && request.readyState === XMLHttpRequest.DONE) service.complete(request)
      }
      request.open("GET", Policy.ENDPOINT, true)
      request.setRequestHeader("Accept", "application/json")
      timeout.restart()
      request.send()
    } catch (e) {
      if (request) service.fail(request, "Could not request currency rates: " + e)
      else {
        service._networkError = "Could not create currency request: " + e
        service._retryAt = service.now() + Policy.RETRY_MS
        service.publish()
      }
      return { started: false, loading: false, error: service.lastError }
    }
    return { started: true, loading: service.loading, date: service.snapshot ? service.snapshot.date : "" }
  }

  onReadyChanged: if (!service.ready) service.cancelRequest()
  Component.onDestruction: { service._destroying = true; service.cancelRequest() }

  Timer {
    id: timeout
    interval: service.timeoutMs
    onTriggered: service.fail(service._request, "Currency request timed out")
  }

  Timer {
    interval: 60000
    repeat: true
    running: service.ready && service.cacheReady
    onTriggered: {
      if (service.rateContext().stale !== service._lastStale) service.publish()
      service.refresh(false)
    }
  }

  FileView {
    id: file
    path: service.ready ? service.path : ""
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onLoaded: {
      var contents = text()
      if (contents !== service._lastWritten || service.cacheReadOnly || !service.cacheReady) service.ingest(contents)
    }
    onFileChanged: reload()
    onLoadFailed: function(error) {
      if (error === FileViewError.FileNotFound) service.ingest("")
      else {
        service.cacheReady = true
        service.cacheReadOnly = true
        service._cacheError = "Cannot read currency cache: " + FileViewError.toString(error)
        service.message("warning", service._cacheError, null)
        service.publish()
        service.refresh(false)
      }
    }
    onSaved: {
      if (!service.cacheReadOnly && service._cacheError) {
        service._cacheError = ""
        service.publish()
      }
    }
    onSaveFailed: function(error) {
      service._lastWritten = ""
      service._cacheError = "Cannot write currency cache: " + FileViewError.toString(error)
      service.message("warning", service._cacheError, null)
      service.publish()
    }
  }
}
