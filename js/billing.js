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
  var PENDING_KEY = "receiptly_pending_payment_ref";
  var PENDING_MAX_AGE = 30 * 86400000;
  // Paystack reference charset: alphanumerics plus - . = (same rule as the Worker).
  var REFERENCE_PATTERN = /^[A-Za-z0-9.=-]{6,100}$/;
  // Captured before account.js strips the hash from the URL.
  var wantsSignIn = /^#signin$/i.test(String(location.hash || ""));
  var verifying = {};
  var autoTried = {};

  function validReference(ref) {
    return REFERENCE_PATTERN.test(String(ref || ""));
  }

  // Paystack appends ?trxref=...&reference=... to callback_url.
  function referenceFromUrl() {
    var q = new URLSearchParams(location.search);
    var ref = String(q.get("reference") || q.get("trxref") || "").trim();
    return validReference(ref) ? ref : "";
  }

  // Only the reference is stored. Amount, plan and owner always come from
  // Paystack and the server, never from this record.
  function readPending() {
    try {
      var raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      var rec = null;
      try { rec = JSON.parse(raw); } catch (e) { rec = { ref: raw, savedAt: Date.now() }; }
      if (!rec || !validReference(rec.ref) || !(Number(rec.savedAt) > 0) ||
          Date.now() - Number(rec.savedAt) > PENDING_MAX_AGE) {
        localStorage.removeItem(PENDING_KEY);
        return null;
      }
      return rec;
    } catch (e) {
      return null;
    }
  }

  function pendingReference() {
    var rec = readPending();
    return rec ? rec.ref : "";
  }

  function rememberReference(ref, extra) {
    if (!validReference(ref)) return;
    try {
      var old = readPending();
      var rec = { ref: ref, savedAt: old && old.ref === ref ? old.savedAt : Date.now() };
      if (old && old.ref === ref) {
        if (old.holdFor) rec.holdFor = old.holdFor;
        if (old.review) rec.review = true;
      }
      if (extra) Object.keys(extra).forEach(function (k) { rec[k] = extra[k]; });
      localStorage.setItem(PENDING_KEY, JSON.stringify(rec));
    } catch (e) { /* storage optional */ }
  }

  function forgetReference(ref) {
    try {
      var rec = readPending();
      if (!rec || !ref || rec.ref === ref) localStorage.removeItem(PENDING_KEY);
    } catch (e) { /* storage optional */ }
  }

  function refreshAccount() {
    if (global.ReceiptlyAccount && ReceiptlyAccount.refreshEntitlement) {
      return Promise.resolve(ReceiptlyAccount.refreshEntitlement()).catch(function () { /* keep current state */ });
    }
    return Promise.resolve();
  }

  function worker() {
    return String((global.ReceiptlyConfig && ReceiptlyConfig.billingWorkerUrl) || "").replace(/\/$/, "");
  }

  function money(naira) {
    return "₦" + Number(naira || 0).toLocaleString();
  }

  async function session() {
    if (!global.ReceiptlyCloud || !ReceiptlyCloud.ready) return null;
    try {
      var sb = await ReceiptlyCloud.ready();
      if (!sb) return null;
      var res = await sb.auth.getSession();
      var s = res && res.data && res.data.session;
      if (!s || !s.access_token) return null;
      return { token: s.access_token, userId: s.user && s.user.id || "" };
    } catch (e) {
      return null;
    }
  }

  async function token() {
    var s = await session();
    return s ? s.token : "";
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
        '<p id="billingModalVerify" role="status"></p>' +
        '<p id="billingModalError" class="error" role="alert"></p>' +
        '<button class="btn btn-secondary" type="button" id="billingRefresh">Refresh access</button>' +
        '<button class="btn btn-ghost" type="button" id="billingClose">Close</button>' +
      "</div>";
    document.body.appendChild(wrap);
    wrap.addEventListener("click", function (e) {
      if (e.target.id === "billingDialog") close();
    });
    document.getElementById("billingClose").addEventListener("click", close);
    document.getElementById("billingCheckout").addEventListener("click", checkout);
    document.getElementById("billingRefresh").addEventListener("click", function () { refreshAccess(); });
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

  function trialEndFrom(data) {
    if (!data) return "";
    return data.trial_ends_at || data.trialEndsAt || "";
  }

  function formatTrialDate(value) {
    var date = new Date(value);
    if (!value || isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
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
    } else if (statusData.loadError) {
      status.textContent = "Subscription status could not be loaded.";
      if (checkout) checkout.disabled = true;
    } else {
      var trialValue = trialEndFrom(statusData);
      var trial = formatTrialDate(trialValue);
      var sub = statusData.subscription || {};
      var activeUntil = sub.status === "active" && sub.expires_at && Date.now() < new Date(sub.expires_at).getTime();
      status.textContent = activeUntil
        ? "Subscription active" + (sub.plan_code ? " (" + sub.plan_code.replace("_", " ") + ")" : "") +
          ", paid through " + formatTrialDate(sub.expires_at) + ". Paying again extends this date."
        : trial
        ? "Trial ends " + trial + ". Current status: " + (sub.status || "trial") +
          (sub.plan_code ? " (" + sub.plan_code.replace("_", " ") + ")" : "") +
          (sub.expires_at ? ", paid through " + formatTrialDate(sub.expires_at) : "") + "."
        : "Trial end date is not available for this account. Current status: " + (sub.status || "trial") + ".";
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
    try {
      var res = await fetch(base + "/api/billing/status", { headers: { Authorization: "Bearer " + access } });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load status.");
      statusData = data;
      render(plansFrom(data));
    } catch (e) {
      statusData = { loadError: true };
      if (error) error.textContent = e.message || "Could not load subscription status.";
      render(FALLBACK_PLANS);
    }
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
      rememberReference(data.reference);
      location.href = data.authorization_url;
    } catch (e) {
      if (error) error.textContent = "Checkout could not be started.";
      if (btn) btn.disabled = false;
    }
  }

  function wirePage() {
    var form = document.getElementById("billingForm");
    if (!form) return;
    var error = document.getElementById("billingError");
    var returned = referenceFromUrl();
    if (returned) rememberReference(returned);
    var refresh = document.getElementById("billingRefreshPage");
    if (refresh) refresh.addEventListener("click", function () { refreshAccess(); });
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
        showSignInLink(true);
        return;
      }
      var plan = document.querySelector("input[name=plan]:checked");
      try {
        var res = await fetch(base + "/api/billing/checkout", {
          method: "POST",
          headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
          body: JSON.stringify({ plan_code: plan ? plan.value : "monthly", renewal_mode: "manual" })
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.authorization_url) {
          if (error) error.textContent = data.error || "Checkout could not be started.";
          return;
        }
        rememberReference(data.reference);
        location.href = data.authorization_url;
      } catch (err) {
        if (error) error.textContent = "Checkout could not be started. Check your connection.";
      }
    });
    // Resume when the user signs in on another tab (supabase-js storage key)
    // or comes back to this tab.
    global.addEventListener("storage", function (e) {
      if (e && e.key === "receiptly-auth" && e.newValue) resumePage();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") resumePage();
    });
    resumePage();
  }

  function showSignInLink(on) {
    var link = document.getElementById("billingSignIn");
    if (link) link.hidden = !on;
  }

  // billing.html: verify a returned/stored reference first, then load status.
  // The verify result and the status line are separate elements, so the
  // status load can never overwrite the verification message.
  async function resumePage() {
    var ref = referenceFromUrl() || pendingReference();
    if (ref) {
      await verifyReference(ref, {
        statusEl: document.getElementById("billingVerify"),
        errorEl: document.getElementById("billingError")
      });
    }
    await loadPageStatus();
  }

  function setText(el, text) {
    if (el) el.textContent = text || "";
  }

  // Asks the Worker to verify a reference with Paystack. Never creates a
  // payment. Safe to repeat: the database applies a reference only once.
  // The stored reference is cleared only after a definitive server answer.
  // Returns one of: applied, signed_out, pending, held, review, cleared, retry.
  async function verifyReference(reference, opts) {
    opts = opts || {};
    var statusEl = opts.statusEl;
    var errorEl = opts.errorEl;
    if (!validReference(reference)) return "cleared";
    if (verifying[reference]) return verifying[reference];
    verifying[reference] = (async function () {
      var base = worker();
      var s = await session();
      if (!base || !s) {
        setText(statusEl, "Sign in to finish activating your payment (reference " + reference + "). The reference is saved on this device, so you do not need to pay again.");
        showSignInLink(true);
        return "signed_out";
      }
      showSignInLink(false);
      setText(errorEl, "");
      setText(statusEl, "Checking payment " + reference + " with Paystack...");
      var res, data;
      try {
        res = await fetch(base + "/api/billing/verify", {
          method: "POST",
          headers: { Authorization: "Bearer " + s.token, "Content-Type": "application/json" },
          body: JSON.stringify({ reference: reference })
        });
        data = await res.json().catch(function () { return {}; });
      } catch (e) {
        setText(statusEl, "Payment " + reference + " is not activated yet.");
        setText(errorEl, "Could not reach the billing service. Check your connection and use Refresh access.");
        return "retry";
      }
      var result = data.result || "";
      if (res.ok && (result === "processed" || result === "already_processed")) {
        forgetReference(reference);
        setText(statusEl, "Payment " + reference + " verified. Your subscription is active.");
        await refreshAccount();
        return "applied";
      }
      var message = data.error || "Payment could not be verified.";
      if (res.status === 401) {
        setText(statusEl, "Sign in to finish activating your payment (reference " + reference + ").");
        showSignInLink(true);
        return "signed_out";
      }
      if (res.status === 400 || res.status === 404 || res.status === 422 ||
          (res.status === 402 && /failed|abandoned|reversed/i.test(String(data.paystack_status || "")))) {
        forgetReference(reference);
        setText(statusEl, "Payment " + reference + " was not activated.");
        setText(errorEl, message);
        return "cleared";
      }
      if (res.status === 402) {
        setText(statusEl, "Payment " + reference + " is not confirmed by Paystack yet. Bank transfers can take a few minutes. Use Refresh access shortly.");
        setText(errorEl, message);
        return "pending";
      }
      if (res.status === 403) {
        // Kept for the account that owns it; not retried automatically here.
        rememberReference(reference, { holdFor: s.userId });
        setText(statusEl, "Payment " + reference + " was not activated for this account.");
        setText(errorEl, message);
        return "held";
      }
      if (res.status === 409) {
        rememberReference(reference, { review: true });
        setText(statusEl, "Payment " + reference + " needs a manual review before it can be activated. Do not pay again.");
        setText(errorEl, message);
        return "review";
      }
      setText(statusEl, "Payment " + reference + " is not activated yet.");
      setText(errorEl, message);
      return "retry";
    })();
    try {
      return await verifying[reference];
    } finally {
      delete verifying[reference];
    }
  }

  // Other pages: once signed in, finish a stored payment automatically
  // (once per page view per reference; skipped if held for another account
  // or waiting for manual review; Refresh access always retries).
  async function autoResume() {
    if (document.getElementById("billingForm")) return;
    if (!(global.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId())) return;
    var rec = readPending();
    if (!rec || autoTried[rec.ref] || rec.review || rec.holdFor === ReceiptlyAccount.userId()) return;
    autoTried[rec.ref] = true;
    var outcome = await verifyReference(rec.ref, {});
    if (outcome === "applied" && global.ReceiptlyUI && ReceiptlyUI.toast) {
      ReceiptlyUI.toast("Payment verified. Your subscription is active.");
    }
  }

  // Re-checks entitlement without creating a payment: verifies the returned or
  // stored Paystack reference (if any), then reloads status from the Worker
  // and the signed-in account's Supabase rows.
  async function refreshAccess() {
    var onPage = !!document.getElementById("billingForm");
    var dialog = document.getElementById("billingDialog");
    var modalOpen = !!(dialog && !dialog.hidden);
    var statusEl = onPage ? document.getElementById("billingVerify") : (modalOpen ? document.getElementById("billingModalVerify") : null);
    var errorEl = onPage ? document.getElementById("billingError") : (modalOpen ? document.getElementById("billingModalError") : null);
    setText(errorEl, "");
    var ref = referenceFromUrl() || pendingReference();
    var outcome = ref ? await verifyReference(ref, { statusEl: statusEl, errorEl: errorEl }) : "none";
    if (!ref && !(await token())) {
      setText(statusEl, "Sign in before refreshing access.");
      showSignInLink(true);
      outcome = "signed_out";
    }
    if (onPage) await loadPageStatus();
    if (modalOpen) await load();
    if (outcome !== "applied") await refreshAccount();
    return outcome;
  }

  async function loadPageStatus() {
    var status = document.getElementById("billingStatus");
    if (!status) return;
    var access = await token();
    if (!access) {
      status.textContent = "Sign in from the receipt generator to see your trial and subscription.";
      showSignInLink(true);
      return;
    }
    var base = worker();
    if (!base) {
      status.textContent = "Billing is not connected yet. The payment Worker URL is missing.";
      return;
    }
    try {
      var res = await fetch(base + "/api/billing/status", { headers: { Authorization: "Bearer " + access } });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || "Could not load status.");
      var trial = formatTrialDate(trialEndFrom(data));
      var sub = data.subscription || {};
      var active = sub.status === "active" && sub.expires_at && Date.now() < new Date(sub.expires_at).getTime();
      status.textContent = active
        ? "Subscription active" + (sub.plan_code ? " (" + String(sub.plan_code).replace("_", " ") + ")" : "") +
          ", paid through " + formatTrialDate(sub.expires_at) + "."
        : trial
        ? "Trial ends " + trial + ". Subscription: " + (sub.status || "trial") +
          (sub.expires_at ? ", paid through " + formatTrialDate(sub.expires_at) : "") + "."
        : "Trial end date is not available for this account. Subscription: " + (sub.status || "trial") + ".";
    } catch (e) {
      status.textContent = (e.message || "Could not load subscription status.") + " Use Refresh access to try again.";
    }
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

  document.addEventListener("receiptly-auth-change", function () { autoResume(); });

  // index.html#signin (link from billing.html): open the sign-in dialog.
  if (wantsSignIn) {
    document.addEventListener("DOMContentLoaded", function () {
      if (!(global.ReceiptlyAccount && ReceiptlyAccount.ready)) return;
      ReceiptlyAccount.ready.then(function () {
        if (!ReceiptlyAccount.userId() && ReceiptlyAccount.showLogin) ReceiptlyAccount.showLogin();
      });
    });
  }

  global.ReceiptlyBilling = {
    open: open,
    close: close,
    refreshAccess: refreshAccess,
    pendingReference: pendingReference,
    trialEndFrom: trialEndFrom,
    formatTrialDate: formatTrialDate
  };
})(window);
