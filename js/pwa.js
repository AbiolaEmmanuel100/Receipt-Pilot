(function () {
  "use strict";

  var deferredPrompt = null;
  var DISMISS = "receiptly_install_dismiss";
  var IOS_DISMISS = "receiptly_ios_install_dismiss";

  function standalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
  }

  function isIos() {
    var ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/i.test(ua) && !window.MSStream;
  }

  function dismissed(key) {
    return localStorage.getItem(key) === "1";
  }

  function installBtn() {
    return document.getElementById("installAppBtn");
  }

  function banner() {
    return document.getElementById("installBanner");
  }

  function ensureBanner() {
    var bar = banner();
    if (bar) return bar;
    bar = document.createElement("div");
    bar.id = "installBanner";
    bar.className = "ios-install-hint";
    bar.hidden = true;
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Install Receipt Pilot");
    bar.innerHTML =
      '<p id="installBannerCopy">Install Receipt Pilot</p>' +
      '<span class="install-banner-actions">' +
        '<button type="button" class="btn btn-primary btn-sm" id="installAppBtn">Install Receipt Pilot</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="installBannerDismiss">Not now</button>' +
      "</span>";
    var header = document.querySelector(".site-header");
    if (header && header.parentNode) header.parentNode.insertBefore(bar, header.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
    var btn = document.getElementById("installAppBtn");
    if (btn) btn.addEventListener("click", onInstallClick);
    var dismiss = document.getElementById("installBannerDismiss");
    if (dismiss) {
      dismiss.addEventListener("click", function () {
        bar.hidden = true;
        localStorage.setItem(isIos() ? IOS_DISMISS : DISMISS, "1");
      });
    }
    return bar;
  }

  function setBannerMode(mode) {
    var copy = document.getElementById("installBannerCopy");
    var btn = installBtn();
    if (mode === "ios") {
      if (copy) copy.innerHTML = "Install Receipt Pilot — tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.";
      if (btn) btn.hidden = true;
    } else {
      if (copy) copy.textContent = "Install Receipt Pilot on this device.";
      if (btn) btn.hidden = false;
    }
  }

  function showBanner(on, mode) {
    if (standalone()) on = false;
    var bar = ensureBanner();
    if (!bar) return;
    if (on && mode) setBannerMode(mode);
    bar.hidden = !on;
  }

  function ensureBtn() {
    ensureBanner();
    return installBtn();
  }

  function showBtn(on) {
    if (isIos()) showBanner(on && !dismissed(IOS_DISMISS), "ios");
    else showBanner(on && !dismissed(DISMISS), "android");
  }

  async function onInstallClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        var choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome === "accepted" && window.ReceiptlyAnalytics) {
          ReceiptlyAnalytics.track("pwa_install_clicked", { page: "pwa" });
        }
      } catch (e) { /* ignore */ }
      deferredPrompt = null;
      showBanner(false);
      return;
    }
    if (isIos()) {
      showBanner(true, "ios");
    }
  }

  if ("serviceWorker" in navigator) {
    var hadController = !!navigator.serviceWorker.controller;
    var swReloading = false;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
      setTimeout(function () {
        try { sessionStorage.removeItem("receiptly_sw_reload"); } catch (e) { /* ignore */ }
      }, 1500);
    });
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController) return;
      if (swReloading) return;
      try {
        if (sessionStorage.getItem("receiptly_sw_reload") === "1") return;
        sessionStorage.setItem("receiptly_sw_reload", "1");
      } catch (e) { /* ignore */ }
      swReloading = true;
      window.location.reload();
    });
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (!standalone() && !dismissed(DISMISS)) showBanner(true, "android");
  });

  window.addEventListener("appinstalled", function () {
    showBanner(false);
    deferredPrompt = null;
    if (window.ReceiptlyAnalytics) ReceiptlyAnalytics.track("pwa_installed", { page: "pwa" });
  });

  document.addEventListener("DOMContentLoaded", function () {
    if (standalone()) {
      var existing = banner();
      if (existing) existing.hidden = true;
      return;
    }
    ensureBanner();
    if (isIos() && !dismissed(IOS_DISMISS)) showBanner(true, "ios");
  });
})();
