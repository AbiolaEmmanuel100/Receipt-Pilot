v(function (global) {
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

  function daysLeft(u) {
    if (!u || !u.trialEndsAt) return null;
    return Math.ceil((new Date(u.trialEndsAt).getTime() - Date.now()) / 86400000);
  }

  function canPersist() {
    if (loggedIn()) {
      var u = global.ReceiptlyAccount && ReceiptlyAccount.user && ReceiptlyAccount.user();
      if (!u || !u.entitlementChecked) return true;
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
        '<div class="auth-brand"><a class="logo" href="index.html">Receipt <span>Pilot</span></a></div>' +
        "<h2>Create a free account to continue</h2>" +
        "<p>You've used Receipt Pilot on this device before. Sign up or log in to keep saving receipts. Existing receipts on this device are not deleted.</p>" +
        '<div class="actions-bar" style="justify-content:center">' +
          '<button type="button" class="btn btn-primary" id="usageGateSignup">Create Free Account</button>' +
          '<button type="button" class="btn btn-secondary" id="usageGateLogin">Log In</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(gate);

    var paywall = document.createElement("div");
    paywall.className = "save-dialog paywall";
    paywall.id = "trialPaywall";
    paywall.hidden = true;
    paywall.setAttribute("role", "dialog");
    paywall.setAttribute("aria-modal", "true");
    paywall.setAttribute("aria-labelledby", "paywallTitle");
    paywall.innerHTML =
      '<div class="card billing-card">' +
        '<div class="auth-brand"><a class="logo" href="index.html">Receipt <span>Pilot</span></a></div>' +
        '<h2 id="paywallTitle">Your free trial has ended</h2>' +
        '<p id="paywallCopy">Your 14-day free trial is over. Choose a plan to restore access to your Receipt Pilot workspace and protected online records.</p>' +
        '<p class="hint">Saved receipts are kept. Access returns after the payment is verified by the server. This screen cannot be dismissed to restore access.</p>' +
        '<ul class="paywall-plans">' +
          "<li>Monthly — ₦1,500</li>" +
          "<li>Quarterly — ₦4,275</li>" +
          "<li>Semi-annual — ₦8,100</li>" +
          "<li>Annual — ₦15,300</li>" +
        "</ul>" +
        '<button type="button" class="btn btn-primary" id="paywallPlans">Choose a plan</button>' +
        '<button type="button" class="btn btn-secondary" id="paywallSignOut">Sign out</button>' +
        '<p class="hint"><a href="privacy-policy.html">Privacy</a> · <a href="terms.html">Terms</a></p>' +
      "</div>";
    document.body.appendChild(paywall);
    document.getElementById("paywallPlans").addEventListener("click", function () {
      if (global.ReceiptlyBilling && ReceiptlyBilling.open) ReceiptlyBilling.open();
      else location.href = "billing.html";
    });
    document.getElementById("paywallSignOut").addEventListener("click", function () {
      if (global.ReceiptlyAccount && ReceiptlyAccount.logout) ReceiptlyAccount.logout();
    });

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

  function showPaywall(message) {
    ensureUi();
    var paywall = document.getElementById("trialPaywall");
    var copy = document.getElementById("paywallCopy");
    if (copy && message) copy.textContent = message;
    if (paywall) paywall.hidden = false;
  }

  function showGate() {
    if (loggedIn()) {
      var u = global.ReceiptlyAccount && ReceiptlyAccount.user && ReceiptlyAccount.user();
      if (u && u.entitlementChecked && !entitled(u)) {
        showPaywall(u.trialEndsAt || u.subscriptionExpiresAt
          ? "Your 14-day free trial is over. Choose a plan to restore access to your Receipt Pilot workspace and protected online records."
          : "We could not confirm an active trial. Existing dates are not reset, and a new trial is not created. Choose a plan to continue.");
      }
      return false;
    }
    initGuestSession();
    if (!requiresAccount()) return false;
    ensureUi();
    document.getElementById("usageGate").hidden = false;
    return true;
  }

  function showTrialBanner() {
    if (!loggedIn()) return;
    var u = global.ReceiptlyAccount && ReceiptlyAccount.user && ReceiptlyAccount.user();
    if (!u || !u.entitlementChecked) return;
    ensureUi();
    var banner = document.getElementById("usageBanner");
    var text = document.getElementById("usageBannerText");
    var signup = document.getElementById("usageBannerSignup");
    var dismiss = document.getElementById("usageBannerDismiss");
    if (!banner || !text) return;
    banner.classList.remove("usage-banner-warn");
    if (!entitled(u)) {
      showPaywall();
      banner.hidden = true;
      return;
    }
    var paywall = document.getElementById("trialPaywall");
    if (paywall) paywall.hidden = true;
    if (u.subscriptionStatus === "active" && u.subscriptionExpiresAt && Date.now() < new Date(u.subscriptionExpiresAt).getTime()) {
      banner.hidden = true;
      return;
    }
    
    var left = daysLeft(u);
    if (left === null) return;

    function updateCountdown() {
      var remaining = new Date(u.trialEndsAt).getTime() - Date.now();

      if (remaining <= 0) {
        text.textContent = "Your free trial has ended.";
        banner.classList.add("usage-banner-warn");
        return false;
      }

      var days = Math.floor(remaining / 86400000);
      var hours = Math.floor((remaining % 86400000) / 3600000);
      var minutes = Math.floor((remaining % 3600000) / 60000);
      var seconds = Math.floor((remaining % 60000) / 1000);

      text.textContent = "Your free trial ends in " +
        days + " days, " +
        hours + " hours, " +
        minutes + " minutes, and " +
        seconds + " seconds.";

      if (days < 4) banner.classList.add("usage-banner-warn");
      return true;
    }

    if (banner._trialCountdown) {
      clearInterval(banner._trialCountdown);
    }

    if (updateCountdown()) {
      banner._trialCountdown = setInterval(function () {
        if (!updateCountdown()) {
          clearInterval(banner._trialCountdown);
          banner._trialCountdown = null;
        }
      }, 1000);
    }

    if (signup) {
      signup.hidden = false;
      signup.textContent = "View plans";
      signup.onclick = function () {
        if (global.ReceiptlyBilling && ReceiptlyBilling.open) ReceiptlyBilling.open();
        else location.href = "billing.html";
      };
    }

    if (left === null) return;
    text.textContent = left <= 1
      ? "Your free trial ends in " + left + " day."
      : "Your free trial ends in " + left + " days.";
    if (left <= 3) banner.classList.add("usage-banner-warn");
    if (signup) {
      signup.hidden = false;
      signup.textContent = "View plans";
      signup.onclick = function () {
        if (global.ReceiptlyBilling && ReceiptlyBilling.open) ReceiptlyBilling.open();
        else location.href = "billing.html";
      };
    }
    if (dismiss) dismiss.hidden = left <= 3;
    banner.hidden = false;
  }

  function boot() {
    cleanOldGateKeys();
    if (global.ReceiptlyAccount && ReceiptlyAccount.ready) {
      ReceiptlyAccount.ready.then(function () {
        if (loggedIn()) {
          showTrialBanner();
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

  document.addEventListener("receiptly-auth-change", showTrialBanner);
  document.addEventListener("DOMContentLoaded", boot);

  global.ReceiptlyUsage = {
    canPersist: canPersist,
    requiresAccount: requiresAccount,
    showGate: showGate,
    endGuestSession: endGuestSession
  };
})(window);
