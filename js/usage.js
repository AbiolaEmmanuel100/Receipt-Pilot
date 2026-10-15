(function (global) {
  "use strict";

  var VISIT_KEY = "receiptly_has_visited";
  var SESSION_GUEST_KEY = "receiptly_session_guest_ok";
  var GATE_SESSION = "receiptly_account_gate_shown";

  function loggedIn() {
    return !!(global.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId());
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function cleanOldGateKeys() {
    try {
      localStorage.removeItem("receiptly_usage_v1");
      localStorage.removeItem("receiptly_usage_banner_day");
      localStorage.removeItem("receiptly_first_use");
      localStorage.removeItem("receiptly_signup_dismiss");
      sessionStorage.removeItem("receiptly_gate_shown");
    } catch (e) { /* ignore */ }
  }

  function hasVisited() {
    try {
      return localStorage.getItem(VISIT_KEY) === "true";
    } catch (e) {
      return false;
    }
  }

  function allowGuestThisSession() {
    try {
      return sessionStorage.getItem(SESSION_GUEST_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function initGuestSession() {
    if (loggedIn()) return;
    if (allowGuestThisSession()) return;
    if (!hasVisited()) {
      try {
        localStorage.setItem(VISIT_KEY, "true");
        sessionStorage.setItem(SESSION_GUEST_KEY, "1");
      } catch (e) { /* ignore */ }
    }
  }

  function endGuestSession() {
    try {
      sessionStorage.removeItem(SESSION_GUEST_KEY);
    } catch (e) { /* ignore */ }
  }

  function requiresAccount() {
    if (loggedIn()) return false;
    return !allowGuestThisSession();
  }

  function entitled(u) {
    if (!u) return false;
    var now = Date.now();
    if (u.subscriptionStatus === "active" && u.subscriptionExpiresAt && now < new Date(u.subscriptionExpiresAt).getTime()) return true;
    if (u.trialEndsAt && now < new Date(u.trialEndsAt).getTime()) return true;
    return false;
  }

  function canPersist() {
    if (loggedIn()) {
      var u = global.ReceiptlyAccount && ReceiptlyAccount.user && ReceiptlyAccount.user();
      if (!u || (!u.trialEndsAt && !u.subscriptionExpiresAt)) return true;
      return entitled(u);
    }
    initGuestSession();
    return allowGuestThisSession();
  }

  function ensureUi() {
    if (document.getElementById("usageBanner")) return;
    var banner = document.createElement("div");
    banner.id = "usageBanner";
    banner.className = "usage-banner";
    banner.hidden = true;
    banner.innerHTML =
      '<p id="usageBannerText"></p>' +
      '<div class="usage-banner-actions">' +
        '<button type="button" class="btn btn-primary btn-sm" id="usageBannerSignup">Create free account</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="usageBannerDismiss">Not now</button>' +
      "</div>";
    var header = document.querySelector(".site-header");
    if (header && header.parentNode) header.parentNode.insertBefore(banner, header.nextSibling);
    else document.body.insertBefore(banner, document.body.firstChild);

    var gate = document.createElement("div");
    gate.className = "save-dialog";
    gate.id = "usageGate";
    gate.hidden = true;
    gate.innerHTML =
      '<div class="card auth-card">' +
        '<div class="auth-brand"><a class="logo" href="index.html">Receipt-<span>Pilot</span></a></div>' +
        "<h2>Create a free account to continue</h2>" +
        "<p>You've used Receipt Pilot on this device before. Sign up or log in to keep saving receipts. Existing receipts on this device are not deleted.</p>" +
        '<div class="actions-bar" style="justify-content:center">' +
          '<button type="button" class="btn btn-primary" id="usageGateSignup">Create Free Account</button>' +
          '<button type="button" class="btn btn-secondary" id="usageGateLogin">Log In</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(gate);

    document.getElementById("usageBannerSignup").addEventListener("click", function () {
      banner.hidden = true;
      if (global.ReceiptlyAccount) ReceiptlyAccount.showSignup();
    });
    document.getElementById("usageBannerDismiss").addEventListener("click", function () {
      banner.hidden = true;
    });
    document.getElementById("usageGateSignup").addEventListener("click", function () {
      gate.hidden = true;
      if (global.ReceiptlyAccount) ReceiptlyAccount.showSignup();
    });
    document.getElementById("usageGateLogin").addEventListener("click", function () {
      gate.hidden = true;
      if (global.ReceiptlyAccount) ReceiptlyAccount.showLogin();
    });
  }

  function showGate() {
    if (loggedIn()) {
      var u = global.ReceiptlyAccount && ReceiptlyAccount.user && ReceiptlyAccount.user();
      if (u && !entitled(u) && (u.trialEndsAt || u.subscriptionExpiresAt)) {
        if (global.ReceiptlyBilling && ReceiptlyBilling.open) ReceiptlyBilling.open();
        else location.href = "billing.html";
      }
      return false;
    }
    initGuestSession();
    if (!requiresAccount()) return false;
    ensureUi();
    document.getElementById("usageGate").hidden = false;
    return true;
  }

  function showSixtyOrNinety() {
    if (!loggedIn()) return;
    var u = global.ReceiptlyAccount && ReceiptlyAccount.user && ReceiptlyAccount.user();
    if (!u) return;
    if (u.subscriptionStatus === "active") return;
    ensureUi();
    var banner = document.getElementById("usageBanner");
    var text = document.getElementById("usageBannerText");
    var dismiss = document.getElementById("usageBannerDismiss");
    var signup = document.getElementById("usageBannerSignup");
    if (!banner || !text) return;

    if (global.ReceiptlyAccount.trialExpired && ReceiptlyAccount.trialExpired(u)) {
      text.textContent = "Your free period has ended. Subscribe to continue using Receipt Pilot. Existing receipts are kept and return after a verified payment.";
      if (signup) {
        signup.hidden = false;
        signup.textContent = "View plans";
        signup.onclick = function () {
          if (global.ReceiptlyBilling && ReceiptlyBilling.open) ReceiptlyBilling.open();
          else location.href = "billing.html";
        };
      }
      banner.hidden = false;
      return;
    }

    if (!u.trialEndsAt) return;
    var end = new Date(u.trialEndsAt).getTime();
    var start = end - 90 * 86400000;
    var elapsed = Math.floor((Date.now() - start) / 86400000);
    if (elapsed < 60) return;
    if (localStorage.getItem("receiptly_60_banner") === today()) return;
    text.textContent = "You are more than 60 days into your 90-day free period. Create backups and keep using Receipt Pilot as usual.";
    if (signup) signup.hidden = true;
    banner.hidden = false;
    if (dismiss) dismiss.onclick = function () {
      banner.hidden = true;
      localStorage.setItem("receiptly_60_banner", today());
    };
  }

  function boot() {
    cleanOldGateKeys();
    if (global.ReceiptlyAccount && ReceiptlyAccount.ready) {
      ReceiptlyAccount.ready.then(function () {
        if (loggedIn()) {
          showSixtyOrNinety();
          return;
        }
        initGuestSession();
        if (requiresAccount()) {
          try {
            if (!sessionStorage.getItem(GATE_SESSION)) {
              sessionStorage.setItem(GATE_SESSION, "1");
              showGate();
            }
          } catch (e) {
            showGate();
          }
        }
      });
    } else {
      initGuestSession();
      if (requiresAccount()) showGate();
    }
  }

  document.addEventListener("DOMContentLoaded", boot);

  global.ReceiptlyUsage = {
    canPersist: canPersist,
    requiresAccount: requiresAccount,
    showGate: showGate,
    endGuestSession: endGuestSession
  };
})(window);
