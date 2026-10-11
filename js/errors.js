(function (global) {
  "use strict";

  function report(message, source) {
    var msg = String(message || "Unknown error").slice(0, 180);
    var src = String(source || "app").slice(0, 40);
    if (typeof console !== "undefined" && console.error) {
      console.error("[Receipt Pilot]", src, msg);
    }
    try {
      var client = global.ReceiptlyCloud && ReceiptlyCloud.client && ReceiptlyCloud.client();
      if (!client) return;
      client.from("error_events").insert({
        source: src,
        message: msg,
        created_at: new Date().toISOString()
      }).then(function () { /* ignore */ }).catch(function () { /* table optional */ });
    } catch (e) { /* never block the app */ }
  }

  global.addEventListener("error", function (e) {
    report((e && e.message) || "script error", "window");
  });
  global.addEventListener("unhandledrejection", function (e) {
    var reason = e && e.reason;
    report((reason && reason.message) || String(reason || "promise"), "promise");
  });

  global.ReceiptlyErrors = { report: report };
})(window);
