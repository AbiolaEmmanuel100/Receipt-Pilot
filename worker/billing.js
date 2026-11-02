/**
 * Receipt Pilot billing Worker.
 * Secrets must be Worker secrets, never frontend files:
 *   PAYSTACK_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Plain vars: SUPABASE_URL, SITE_ORIGIN (falls back to https://receipt-pilot.com)
 * Webhooks are verified with PAYSTACK_SECRET_KEY (Paystack signs with it).
 * Do not set PAYSTACK_WEBHOOK_SECRET; it is not used.
 * Optional:
 *   PAYSTACK_PUBLIC_KEY, PAYSTACK_RECURRING_ENABLED,
 *   PAYSTACK_PLAN_MONTHLY, PAYSTACK_PLAN_QUARTERLY,
 *   PAYSTACK_PLAN_SEMI_ANNUAL, PAYSTACK_PLAN_ANNUAL
 *
 * Manual renewal is the default. Automatic renewal is offered only when
 * PAYSTACK_RECURRING_ENABLED=true and a Paystack plan code exists for the plan.
 * A one-time payment is never treated as consent for future charges.
 */

const DEFAULT_SITE_ORIGIN = "https://receipt-pilot.com";

const PLANS = {
  monthly: { months: 1, naira: 1500, kobo: 150000 },
  quarterly: { months: 3, naira: 4275, kobo: 427500 },
  semi_annual: { months: 6, naira: 8100, kobo: 810000 },
  annual: { months: 12, naira: 15300, kobo: 1530000 }
};

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (e) {
      // Never report success on an unexpected failure. Webhooks get a 500 so
      // Paystack retries; browser calls get a CORS-readable JSON error.
      console.error("billing worker error", new URL(request.url).pathname, e && e.message);
      return cors(json({ result: "retry", error: "The billing service had a temporary problem. Try again shortly." }, 500));
    }
  }
};

async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
  if (url.pathname === "/api/billing/plans" && request.method === "GET") {
    return cors(json({ plans: publicPlans(env), recurringEnabled: recurringEnabled(env) }));
  }
  if (url.pathname === "/api/billing/checkout" && request.method === "POST") {
    return cors(await checkout(request, env));
  }
  if (url.pathname === "/api/billing/webhook" && request.method === "POST") {
    return await webhook(request, env);
  }
  if (url.pathname === "/api/billing/status" && request.method === "GET") {
    return cors(await status(request, env));
  }
  if (url.pathname === "/api/billing/verify" && request.method === "POST") {
    return cors(await verifyReturn(request, env));
  }
  return new Response("Not found", { status: 404 });
}

function publicPlans(env) {
  return Object.keys(PLANS).map(function (code) {
    return {
      code: code,
      months: PLANS[code].months,
      naira: PLANS[code].naira,
      automaticAvailable: recurringEnabled(env) && !!planCode(env, code)
    };
  });
}

function recurringEnabled(env) {
  return String(env.PAYSTACK_RECURRING_ENABLED || "").toLowerCase() === "true";
}

function planCode(env, code) {
  const map = {
    monthly: env.PAYSTACK_PLAN_MONTHLY,
    quarterly: env.PAYSTACK_PLAN_QUARTERLY,
    semi_annual: env.PAYSTACK_PLAN_SEMI_ANNUAL,
    annual: env.PAYSTACK_PLAN_ANNUAL
  };
  return map[code] || "";
}

async function checkout(request, env) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Sign in required." }, 401);
  const body = await request.json().catch(function () { return {}; });
  const plan = PLANS[body.plan_code];
  if (!plan) return json({ error: "Unknown plan." }, 400);
  const renewal = body.renewal_mode === "automatic" ? "automatic" : "manual";
  if (renewal === "automatic" && !(recurringEnabled(env) && planCode(env, body.plan_code))) {
    return json({ error: "Automatic renewal is not available. Choose manual renewal." }, 400);
  }
  if (!env.PAYSTACK_SECRET_KEY) return json({ error: "Paystack is not configured on the payment Worker." }, 503);
  const payload = {
    email: user.email,
    amount: plan.kobo,
    currency: "NGN",
    callback_url: siteOrigin(env) + "/billing.html",
    metadata: {
      user_id: user.id,
      plan_code: body.plan_code,
      renewal_mode: renewal,
      expected_amount_minor: plan.kobo
    }
  };
  if (renewal === "automatic") payload.plan = planCode(env, body.plan_code);
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.PAYSTACK_SECRET_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(function () { return {}; });
  if (!data.status) {
    console.error("paystack initialize failed", res.status, data.message || "");
    return json({ error: "Could not start checkout." }, 502);
  }
  return json({ authorization_url: data.data.authorization_url, reference: data.data.reference });
}

// Paystack reference charset: alphanumerics plus - . = (Paystack docs).
const REFERENCE_PATTERN = /^[A-Za-z0-9.=-]{6,100}$/;

// apply_verified_payment results that mean "access is (already) applied".
const APPLIED_RESULTS = ["processed", "already_processed"];

async function webhook(request, env) {
  const raw = await request.text();
  if (!env.PAYSTACK_SECRET_KEY) {
    console.error("webhook: PAYSTACK_SECRET_KEY is not configured");
    return new Response("not configured", { status: 500 });
  }
  // Paystack signs the raw body with HMAC-SHA512 using the secret key.
  const signature = request.headers.get("x-paystack-signature") || "";
  const expected = await hmac(env.PAYSTACK_SECRET_KEY, raw);
  if (!safeEqual(signature, expected)) {
    console.warn("webhook: invalid signature");
    return new Response("invalid signature", { status: 401 });
  }
  let event;
  try {
    event = JSON.parse(raw);
  } catch (e) {
    console.warn("webhook: invalid json");
    return new Response("invalid json", { status: 400 });
  }
  const reference = event && event.data && event.data.reference;
  if (event.event !== "charge.success") return new Response("ignored", { status: 200 });
  if (!reference) {
    console.warn("webhook: charge.success without reference");
    return new Response("missing reference", { status: 200 });
  }
  const verified = await verifyPaystack(env, reference);
  if (verified.unavailable) {
    // Paystack API unreachable: not acknowledged, so Paystack retries later.
    console.error("webhook: paystack verify unavailable", reference, verified.httpStatus || "");
    return new Response("verify unavailable", { status: 500 });
  }
  if (!verified.ok || verified.reference !== reference) {
    console.warn("webhook: paystack did not confirm", reference, verified.status || "");
    return new Response("not verified", { status: 200 });
  }
  const outcome = await applyPayment(env, verified, event);
  console.log("webhook: result", reference, outcome.result, outcome.reason || "");
  // A database/RPC failure must not be acknowledged, so Paystack retries it.
  if (outcome.result === "rpc_error") return new Response("rpc_error", { status: 500 });
  // Duplicates are acknowledged (idempotent). Rejections and manual-review
  // cases are acknowledged too: a retry cannot change them. They are logged.
  return new Response(outcome.result + (outcome.reason ? ":" + outcome.reason : ""), { status: 200 });
}

// Validates server-side Paystack data against the server-set metadata and,
// only if everything matches, calls the atomic, idempotent database function.
// Returns { result, reason? }. Never activates on missing or mismatched data.
async function applyPayment(env, verified, event, expectedUserId) {
  const meta = verified.metadata || {};
  if (!meta.user_id) return { result: "needs_manual_review", reason: "missing_metadata_user_id" };
  if (expectedUserId && meta.user_id !== expectedUserId) return { result: "wrong_user", reason: "metadata_user_mismatch" };
  const plan = PLANS[meta.plan_code];
  if (!plan) return { result: "needs_manual_review", reason: "missing_or_unknown_plan_code" };
  if (verified.currency !== "NGN") return { result: "rejected", reason: "currency" };
  if (verified.amount !== plan.kobo) return { result: "rejected", reason: "amount" };
  if (Number(meta.expected_amount_minor) !== plan.kobo) return { result: "rejected", reason: "expected_amount_minor" };
  const renewal = meta.renewal_mode === "automatic" ? "automatic" : "manual";
  const eventId = event && (event.id || (event.data && event.data.id));
  const result = await supabase(env, "/rest/v1/rpc/apply_verified_payment", {
    method: "POST",
    body: JSON.stringify({
      p_user_id: meta.user_id,
      p_provider: "paystack",
      p_provider_event_id: eventId ? String(eventId) : null,
      p_provider_reference: verified.reference,
      p_plan_code: meta.plan_code,
      p_amount_minor: verified.amount,
      p_currency: verified.currency,
      p_renewal_mode: renewal
    })
  });
  if (typeof result !== "string") {
    console.error("apply_verified_payment failed", verified.reference, result && (result.status || ""), result && (result.code || ""), result && (result.message || ""));
    // Definitive data problems (retrying cannot fix them): the metadata user
    // does not exist (FK 23503) or has no subscriptions row. Nothing was
    // written (the function rolls back). Logged for manual review.
    if (result && result.code === "23503") return { result: "needs_manual_review", reason: "unknown_user" };
    if (result && /missing_subscription/.test(String(result.message || ""))) {
      return { result: "needs_manual_review", reason: "missing_subscription" };
    }
    return { result: "rpc_error" };
  }
  if (APPLIED_RESULTS.indexOf(result) !== -1) return { result: result };
  // Same event id already used for a DIFFERENT reference: this reference was
  // not applied. Same reference with different user/amount/plan: conflict.
  if (result === "duplicate_event_id" || result === "reference_conflict") {
    return { result: "needs_manual_review", reason: result };
  }
  if (result.indexOf("rejected_") === 0) return { result: "rejected", reason: result.slice(9) };
  // "already_claimed", "missing_reference" or anything unexpected: not applied.
  console.error("apply_verified_payment unexpected result", verified.reference, result);
  return { result: "rpc_error", reason: result };
}

async function verifyReturn(request, env) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Sign in required." }, 401);
  if (!env.PAYSTACK_SECRET_KEY) return json({ error: "Paystack is not configured on the payment Worker." }, 503);
  const body = await request.json().catch(function () { return {}; });
  const reference = String(body.reference || "").trim();
  if (!REFERENCE_PATTERN.test(reference)) {
    return json({ result: "invalid_reference", error: "That payment reference is not valid." }, 400);
  }
  const verified = await verifyPaystack(env, reference);
  if (verified.unavailable) {
    console.error("verify: paystack verify unavailable", reference, verified.httpStatus || "");
    return json({ result: "retry", error: "Paystack could not be reached. Try Refresh access again shortly." }, 502);
  }
  if (verified.notFound) {
    console.warn("verify: reference not found on Paystack", reference);
    return json({ result: "not_found", error: "Paystack has no payment with this reference." }, 404);
  }
  if (!verified.ok || verified.reference !== reference) {
    console.warn("verify: paystack did not confirm", reference, verified.status || "");
    return json({
      result: "not_successful",
      paystack_status: verified.status || null,
      error: "Paystack has not confirmed this payment as successful" + (verified.status ? " (status: " + verified.status + ")." : ".")
    }, 402);
  }
  const outcome = await applyPayment(env, verified, { id: "return:" + reference, data: { id: reference } }, user.id);
  console.log("verify: result", reference, outcome.result, outcome.reason || "");
  if (outcome.result === "processed" || outcome.result === "already_processed") {
    return json({ result: outcome.result, reference: verified.reference });
  }
  if (outcome.result === "wrong_user") {
    return json({ result: "wrong_user", error: "This payment belongs to a different Receipt Pilot account. Sign in with the account that started the payment." }, 403);
  }
  if (outcome.result === "needs_manual_review") {
    return json({
      result: "needs_manual_review",
      reason: outcome.reason,
      reference: verified.reference,
      error: "Paystack confirmed this payment, but it is missing the account details needed to activate it automatically. It has been logged for manual review. Do not pay again."
    }, 409);
  }
  if (outcome.result === "rejected") {
    return json({ result: "rejected", reason: outcome.reason, error: "This payment does not match a Receipt Pilot plan (" + outcome.reason + ")." }, 422);
  }
  return json({ result: "retry", error: "The payment was confirmed by Paystack but could not be saved. Try Refresh access again shortly." }, 502);
}

async function status(request, env) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Sign in required." }, 401);
  const usage = await supabase(env, "/rest/v1/usage?user_id=eq." + encodeURIComponent(user.id) + "&select=trial_ends_at");
  if (isSupabaseError(usage)) return json({ error: "Could not read the trial date." }, 502);
  const sub = await supabase(env, "/rest/v1/subscriptions?user_id=eq." + encodeURIComponent(user.id) + "&select=status,expires_at,plan_code,renewal_mode");
  if (isSupabaseError(sub)) return json({ error: "Could not read the subscription." }, 502);
  const trialEndsAt = usage[0] && usage[0].trial_ends_at || null;
  return json({
    trial_ends_at: trialEndsAt,
    trialEndsAt: trialEndsAt,
    subscription: sub[0] || null,
    plans: publicPlans(env),
    recurringEnabled: recurringEnabled(env)
  });
}

async function verifyPaystack(env, reference) {
  let res;
  try {
    res = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
      headers: { Authorization: "Bearer " + env.PAYSTACK_SECRET_KEY }
    });
  } catch (e) {
    return { ok: false, unavailable: true };
  }
  if (res.status >= 500 || res.status === 429 || res.status === 401) {
    // 401 = Worker key problem; treat as unavailable, never as "not paid".
    return { ok: false, unavailable: true, httpStatus: res.status };
  }
  const data = await res.json().catch(function () { return {}; });
  if (res.status === 404 || res.status === 400) return { ok: false, notFound: true, httpStatus: res.status };
  if (!data.status || !data.data || data.data.status !== "success") {
    return { ok: false, status: data.data && data.data.status };
  }
  let metadata = data.data.metadata || {};
  if (typeof metadata === "string") {
    try { metadata = JSON.parse(metadata); } catch (e) { metadata = {}; }
  }
  return {
    ok: true,
    reference: data.data.reference,
    amount: data.data.amount,
    currency: data.data.currency,
    metadata: metadata && typeof metadata === "object" ? metadata : {}
  };
}

async function requireUser(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const res = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { Authorization: "Bearer " + token, apikey: env.SUPABASE_SERVICE_ROLE_KEY }
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error("auth lookup failed: " + res.status);
  return res.json();
}

async function supabase(env, path, options) {
  const res = await fetch(env.SUPABASE_URL + path, {
    method: (options && options.method) || "GET",
    headers: Object.assign({
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json"
    }, (options && options.headers) || {}),
    body: options && options.body
  });
  const body = await res.json().catch(function () { return null; });
  if (!res.ok) {
    console.error("supabase request failed", path.split("?")[0], res.status, body && (body.code || ""), body && (body.message || ""));
    return { error: true, status: res.status, code: body && body.code, message: body && body.message };
  }
  return body === null ? [] : body;
}

function siteOrigin(env) {
  const value = String(env.SITE_ORIGIN || "").trim().replace(/\/$/, "");
  return /^https:\/\/[^/]+$/.test(value) ? value : DEFAULT_SITE_ORIGIN;
}

function isSupabaseError(value) {
  return !Array.isArray(value);
}

async function hmac(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map(function (b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}

function cors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return new Response(response.body, { status: response.status, headers: headers });
}
