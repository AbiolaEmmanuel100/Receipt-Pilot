(function () {
  "use strict";

  var WORKER = (window.ReceiptlyConfig && ReceiptlyConfig.billingWorkerUrl) || "";

  function statusEl() { return document.getElementById("billingStatus"); }
  function errorEl() { return document.getElementById("billingError"); }

  async function token() {
    if (!window.ReceiptlyCloud || !ReceiptlyCloud.ready) return "";
    var sb = await ReceiptlyCloud.ready();
    if (!sb) return "";
    var session = await sb.auth.getSession();
    return session.data && session.data.session && session.data.session.access_token || "";
  }

  async function loadStatus() {
    var access = await token();
    if (!access) {
      statusEl().textContent = "Sign in from the receipt generator, then return here.";
      return;
    }
    if (!WORKER) {
      statusEl().textContent = "Billing is not connected yet. The payment Worker URL is missing.";
      return;
    }
    var res = await fetch(WORKER.replace(/\/$/, "") + "/api/billing/status", {
      headers: { Authorization: "Bearer " + access }
    });
    var data = await res.json();
    var trial = data.trial_ends_at ? new Date(data.trial_ends_at).toLocaleDateString() : "not set";
    var sub = data.subscription || {};
    statusEl().textContent = "Trial ends " + trial + ". Subscription: " + (sub.status || "trial") +
      (sub.expires_at ? ", paid through " + new Date(sub.expires_at).toLocaleDateString() : "") + ".";
    var auto = document.getElementById("autoRenewal");
    if (auto) auto.disabled = !data.recurringEnabled;
  }

  document.getElementById("billingForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    errorEl().textContent = "";
    if (!WORKER) {
      errorEl().textContent = "Billing Worker is not configured.";
      return;
    }
    var access = await token();
    if (!access) {
      errorEl().textContent = "Sign in before paying.";
      return;
    }
    var plan = document.querySelector("input[name=plan]:checked").value;
    var renewal = document.querySelector("input[name=renewal]:checked").value;
    var res = await fetch(WORKER.replace(/\/$/, "") + "/api/billing/checkout", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + access,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ plan_code: plan, renewal_mode: renewal })
    });
    var data = await res.json();
    if (!res.ok || !data.authorization_url) {
      errorEl().textContent = data.error || "Checkout could not be started.";
      return;
    }
    location.href = data.authorization_url;
  });

  loadStatus().catch(function () {
    errorEl().textContent = "Could not load billing status.";
  });
})();
