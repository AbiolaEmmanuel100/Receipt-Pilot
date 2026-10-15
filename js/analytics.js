(function (global) {
  "use strict";

  var ALLOWED_PARAMS = {
    currency: true,
    template: true,
    payment_method: true,
    payment_status: true,
    page: true
  };

  function cfg() {
    return global.ReceiptlyConfig || { analyticsEnabled: false, gaMeasurementId: "" };
  }

  function ready() {
    var c = cfg();
    var id = c.gaMeasurementId || "";
    return !!(c.analyticsEnabled && id && !/X{6,}|XXXXXXXXXX/i.test(id));
  }

  function cleanParams(params) {
    var out = {};
    if (!params) return out;
    Object.keys(params).forEach(function (k) {
      if (!ALLOWED_PARAMS[k]) return;
      var v = params[k];
      if (v == null || v === "") return;
      out[k] = String(v).slice(0, 40);
    });
    return out;
  }

  function loadGtag() {
    if (global.__receiptlyGtagLoaded) return;
    if (!ready()) return;
    global.__receiptlyGtagLoaded = true;
    var id = cfg().gaMeasurementId;
    global.dataLayer = global.dataLayer || [];
    global.gtag = global.gtag || function () { global.dataLayer.push(arguments); };
    global.gtag("js", new Date());
    global.gtag("config", id, { anonymize_ip: true, send_page_view: true });
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(s);
  }

  function track(name, params) {
    var safe = cleanParams(params);
    if (!cfg().analyticsEnabled) return;
    if (!ready()) {
      if (typeof console !== "undefined" && console.debug) {
        console.debug("[Receipt Pilot analytics disabled/unconfigured]", name, safe);
      }
      return;
    }
    loadGtag();
    if (typeof global.gtag === "function") {
      global.gtag("event", name, safe);
    }
  }

  function pageView() {
    if (!ready()) return;
    loadGtag();
  }

  document.addEventListener("DOMContentLoaded", function () {
    loadGtag();
    pageView();
    var path = (location.pathname || "").split("/").pop() || "index.html";
    if (path === "" || path === "index.html") {
      track("receipt_generator_opened", { page: "generator" });
    }
  });

  global.ReceiptlyAnalytics = {
    track: track,
    pageView: pageView,
    ready: ready
  };
})(window);
