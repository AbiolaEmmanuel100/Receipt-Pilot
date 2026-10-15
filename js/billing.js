(function (global) {
  "use strict";

  var FALLBACK_PLANS = [
    { code: "monthly", label: "Monthly", naira: 1500 },
    { code: "quarterly", label: "Quarterly", naira: 4275 },
    { code: "semi_annual", label: "Semi-annual", naira: 8100 },
    { code: "annual", label: "Annual", naira: 15300 }
  ];
  var selected = "monthly";
  var statusData = null;
  var lastFocus = null;
  var keyHandler = null;

  function worker() {
    return String((global.ReceiptlyConfig && ReceiptlyConfig.billingWorkerUrl) || "").replace(/\/$/, "");
  }

  function money(naira) {
    return "₦" + Number(naira || 0).toLocaleString();
  }

  async function token() {
    if (!global.ReceiptlyCloud || !ReceiptlyCloud.ready) return "";
    var sb = await ReceiptlyCloud.ready();
    if (!sb) return "";
    var session = await sb.auth.getSession();
    return session.data && session.data.session && session.data.session.access_token || "";
  }

  function ensureModal() {
    if (document.getElementById("billingDialog")) return;
    var wrap = document.createElement("div");
    wrap.className = "save-dialog";
    wrap.id = "billingDialog";
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="card billing-card" role="dialog" aria-modal="true" aria-labelledby="billingTitle">' +
        '<h2 id="billingTitle">Subscription</h2>' +
        '<p id="billingModalStatus">Loading your subscription status.</p>' +
        '<p class="hint">Renewal is manual. You start each payment. Automatic renewal is not available.</p>' +
        '<div id="billingPlans" role="radiogroup" aria-label="Subscription plans"></div>' +
        '<button class="btn btn-primary" type="button" id="billingCheckout">Continue to Paystack</button>' +
        '<p id="billingModalError" class="error" role="alert"></p>' +
        '<button class="btn btn-ghost" type="button" id="billingClose">Close</button>' +
      "</div>";
    document.body.appendChild(wrap);
    wrap.addEventListener("click", function (e) {
      if (e.target.id === "billingDialog") close();
    });
    document.getElementById("billingClose").addEventListener("click", close);
    document.getElementById("billingCheckout").addEventListener("click", checkout);
    document.getElementById("billingPlans").addEventListener("change", function (e) {
      if (e.target && e.target.name === "billingPlan") selected = e.target.value;
    });
  }

  function open() {
    ensureModal();
    lastFocus = document.activeElement;
    document.getElementById("billingDialog").hidden = false;
    if (!keyHandler) {
      keyHandler = function (e) {
        if (e.key === "Escape") close();
      };
      document.addEventListener("keydown", keyHandler);
    }
    load().then(function () {
      var closeBtn = document.getElementById("billingClose");
      if (closeBtn) closeBtn.focus();
    });
  }

  function close() {
    var dialog = document.getElementById("billingDialog");
    if (dialog) dialog.hidden = true;
    if (keyHandler) {
      document.removeEventListener("keydown", keyHandler);
      keyHandler = null;
    }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function plansFrom(data) {
    if (data && data.plans && data.plans.length) {
      return data.plans.map(function (p) {
        return { code: p.code, label: p.label || p.code, naira: p.naira };
      });
    }
    return FALLBACK_PLANS.slice();
  }

  function render(plans) {
    var box = document.getElementById("billingPlans");
    var status = document.getElementById("billingModalStatus");
    var checkout = document.getElementById("billingCheckout");
    var current = statusData && statusData.subscription && statusData.subscription.plan_code;
    if (!box || !status) return;
    if (!statusData || statusData.signedOut) {
      status.textContent = "Sign in from Account before choosing a plan.";
      if (checkout) checkout.disabled = true;
    } else {
      var trial = statusData.trial_ends_at ? new Date(statusData.trial_ends_at).toLocaleDateString() : "not set";
      var sub = statusData.subscription || {};
      status.textContent = "Trial ends " + trial + ". Current status: " + (sub.status || "trial") +
        (sub.plan_code ? " (" + sub.plan_code.replace("_", " ") + ")" : "") +
        (sub.expires_at ? ", paid through " + new Date(sub.expires_at).toLocaleDateString() : "") + ".";
      if (checkout) checkout.disabled = false;
    }
    box.innerHTML = plans.map(function (p) {
      var currentMark = current === p.code ? " — current plan" : "";
      return '<label class="billing-plan">' +
        '<input type="radio" name="billingPlan" value="' + p.code + '"' + (selected === p.code ? " checked" : "") + ">" +
        "<span>" + p.label + " — " + money(p.naira) + currentMark + "</span>" +
      "</label>";
    }).join("");
  }

  async function load() {
    var error = document.getElementById("billingModalError");
    if (error) error.textContent = "";
    var access = await token();
    if (!access) {
      statusData = { signedOut: true };
      render(FALLBACK_PLANS);
      return;
    }
    var base = worker();
    if (!base) {
      if (error) error.textContent = "Billing Worker is not configured.";
      render(FALLBACK_PLANS);
      return;
    }
    var res = await fetch(base + "/api/billing/status", { headers: { Authorization: "Bearer " + access } });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load status.");
    statusData = data;
    render(plansFrom(data));
  }

  async function checkout() {
    var error = document.getElementById("billingModalError");
    if (error) error.textContent = "";
    var base = worker();
    if (!base) {
      if (error) error.textContent = "Billing Worker is not configured.";
      return;
    }
    var access = await token();
    if (!access) {
      if (error) error.textContent = "Sign in before paying.";
      if (global.ReceiptlyAccount && ReceiptlyAccount.showLogin) ReceiptlyAccount.showLogin();
      return;
    }
    var btn = document.getElementById("billingCheckout");
    if (btn) btn.disabled = true;
    try {
      var res = await fetch(base + "/api/billing/checkout", {
        method: "POST",
        headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
        body: JSON.stringify({ plan_code: selected, renewal_mode: "manual" })
      });
      var data = await res.json();
      if (!res.ok || !data.authorization_url) {
        if (error) error.textContent = data.error || "Checkout could not be started.";
        if (btn) btn.disabled = false;
        return;
      }
      location.href = data.authorization_url;
    } catch (e) {
      if (error) error.textContent = "Checkout could not be started.";
      if (btn) btn.disabled = false;
    }
  }

  function wirePage() {
    var form = document.getElementById("billingForm");
    if (!form) return;
    var status = document.getElementById("billingStatus");
    var error = document.getElementById("billingError");
    if (new URLSearchParams(location.search).get("reference") && status) {
      status.textContent = "Returned from Paystack. Access updates only after the payment is verified by the server.";
    }
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (error) error.textContent = "";
      var base = worker();
      if (!base) {
        if (error) error.textContent = "Billing Worker is not configured.";
        return;
      }
      var access = await token();
      if (!access) {
        if (error) error.textContent = "Sign in before paying.";
        return;
      }
      var plan = document.querySelector("input[name=plan]:checked");
      var res = await fetch(base + "/api/billing/checkout", {
        method: "POST",
        headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
        body: JSON.stringify({ plan_code: plan ? plan.value : "monthly", renewal_mode: "manual" })
      });
      var data = await res.json();
      if (!res.ok || !data.authorization_url) {
        if (error) error.textContent = data.error || "Checkout could not be started.";
        return;
      }
      location.href = data.authorization_url;
    });
    loadPageStatus();
  }

  async function loadPageStatus() {
    var status = document.getElementById("billingStatus");
    if (!status) return;
    var access = await token();
    if (!access) {
      status.textContent = "Sign in from the receipt generator, then return here.";
      return;
    }
    var base = worker();
    if (!base) {
      status.textContent = "Billing is not connected yet. The payment Worker URL is missing.";
      return;
    }
    var res = await fetch(base + "/api/billing/status", { headers: { Authorization: "Bearer " + access } });
    var data = await res.json();
    var trial = data.trial_ends_at ? new Date(data.trial_ends_at).toLocaleDateString() : "not set";
    var sub = data.subscription || {};
    status.textContent = "Trial ends " + trial + ". Subscription: " + (sub.status || "trial") +
      (sub.expires_at ? ", paid through " + new Date(sub.expires_at).toLocaleDateString() : "") + ".";
  }

  document.addEventListener("click", function (e) {
    var opener = e.target.closest && e.target.closest("[data-open-billing]");
    if (!opener) return;
    e.preventDefault();
    open();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wirePage);
  } else {
    wirePage();
  }

  global.ReceiptlyBilling = { open: open, close: close };
})(window);
