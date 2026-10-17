
/**
 * Receipt Pilot billing Worker.
 *
 * Required Worker secrets:
 *   PAYSTACK_SECRET_KEY
 *   PAYSTACK_WEBHOOK_SECRET
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional Worker variables/secrets:
 *   PAYSTACK_PUBLIC_KEY
 *   SITE_ORIGIN
 *   PAYSTACK_RECURRING_ENABLED
 *   PAYSTACK_PLAN_MONTHLY
 *   PAYSTACK_PLAN_QUARTERLY
 *   PAYSTACK_PLAN_SEMI_ANNUAL
 *   PAYSTACK_PLAN_ANNUAL
 *
 * Manual renewal is the default.
 * Automatic renewal is offered only when explicitly enabled and
 * a Paystack plan code exists for the selected plan.
 */

const PLANS = {
  monthly: { months: 1, naira: 1500, kobo: 150000 },
  quarterly: { months: 3, naira: 4275, kobo: 427500 },
  semi_annual: { months: 6, naira: 8100, kobo: 810000 },
  annual: { months: 12, naira: 15300, kobo: 1530000 }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    if (
      url.pathname === "/api/billing/plans" &&
      request.method === "GET"
    ) {
      return cors(
        json({
          plans: publicPlans(env),
          recurringEnabled: recurringEnabled(env)
        })
      );
    }

    if (
      url.pathname === "/api/billing/checkout" &&
      request.method === "POST"
    ) {
      return cors(await checkout(request, env));
    }

    if (
      url.pathname === "/api/billing/webhook" &&
      request.method === "POST"
    ) {
      return await webhook(request, env);
    }

    if (
      url.pathname === "/api/billing/status" &&
      request.method === "GET"
    ) {
      return cors(await status(request, env));
    }

    if (
      url.pathname === "/api/billing/verify" &&
      request.method === "POST"
    ) {
      return cors(await verifyReturn(request, env));
    }

    return new Response("Not found", { status: 404 });
  }
};

function publicPlans(env) {
  return Object.keys(PLANS).map(function (code) {
    return {
      code: code,
      months: PLANS[code].months,
      naira: PLANS[code].naira,
      automaticAvailable:
        recurringEnabled(env) && !!planCode(env, code)
    };
  });
}

function recurringEnabled(env) {
  return (
    String(env.PAYSTACK_RECURRING_ENABLED || "").toLowerCase() ===
    "true"
  );
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

  if (!user) {
    return json({ error: "Sign in required." }, 401);
  }

  const body = await request.json().catch(function () {
    return {};
  });

  const plan = PLANS[body.plan_code];

  if (!plan) {
    return json({ error: "Unknown plan." }, 400);
  }

  const renewal =
    body.renewal_mode === "automatic" ? "automatic" : "manual";

  if (
    renewal === "automatic" &&
    !(recurringEnabled(env) && planCode(env, body.plan_code))
  ) {
    return json(
      {
        error:
          "Automatic renewal is not available. Choose manual renewal."
      },
      400
    );
  }

  if (!env.PAYSTACK_SECRET_KEY) {
    return json(
      { error: "Paystack is not configured on the payment Worker." },
      503
    );
  }

  const payload = {
    email: user.email,
    amount: plan.kobo,
    currency: "NGN",
    channels: ["card", "bank", "bank_transfer", "ussd"],
    callback_url:
      (env.SITE_ORIGIN || "").replace(/\/$/, "") + "/billing.html",
    metadata: {
      user_id: user.id,
      plan_code: body.plan_code,
      renewal_mode: renewal,
      expected_amount_minor: plan.kobo
    }
  };

  if (renewal === "automatic") {
    payload.plan = planCode(env, body.plan_code);
  }

  const res = await fetch(
    "https://api.paystack.co/transaction/initialize",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.PAYSTACK_SECRET_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await res.json().catch(function () {
    return {};
  });

  if (!res.ok || !data.status || !data.data) {
    return json(
      { error: "Could not start checkout." },
      502
    );
  }

  return json({
    authorization_url: data.data.authorization_url,
    reference: data.data.reference
  });
}

async function webhook(request, env) {
  const raw = await request.text();
  const signature =
    request.headers.get("x-paystack-signature") || "";

  const secret =
    env.PAYSTACK_WEBHOOK_SECRET || env.PAYSTACK_SECRET_KEY;

  if (!secret) {
    return new Response("Webhook secret is not configured", {
      status: 503
    });
  }

  const expected = await hmac(secret, raw);

  if (!safeEqual(signature, expected)) {
    return new Response("invalid signature", { status: 401 });
  }

  let event;

  try {
    event = JSON.parse(raw);
  } catch (e) {
    return new Response("invalid payload", { status: 400 });
  }

  const reference =
    event.data && event.data.reference;

  if (!reference) {
    return new Response("missing reference", { status: 200 });
  }

  if (event.event !== "charge.success") {
    return new Response("ignored", { status: 200 });
  }

  const verified = await verifyPaystack(env, reference);

  if (!verified.ok || verified.reference !== reference) {
    return new Response("not verified", { status: 200 });
  }

  const applied = await applyPayment(env, verified, event);

  return new Response(applied, { status: 200 });
}

async function applyPayment(env, verified, event) {
  const meta = verified.metadata || {};
  const plan = PLANS[meta.plan_code];

  if (!plan || !meta.user_id) {
    return "rejected plan or user";
  }

  if (
    verified.currency !== "NGN" ||
    verified.amount !== plan.kobo
  ) {
    return "rejected amount";
  }

  if (Number(meta.expected_amount_minor) !== plan.kobo) {
    return "rejected expected amount";
  }

  const renewal =
    meta.renewal_mode === "automatic" ? "automatic" : "manual";

  const eventId =
    event &&
    (event.id || (event.data && event.data.id))
      ? String(event.id || event.data.id)
      : null;

  const result = await supabase(
    env,
    "/rest/v1/rpc/apply_verified_payment",
    {
      method: "POST",
      body: JSON.stringify({
        p_user_id: meta.user_id,
        p_provider: "paystack",
        p_provider_event_id: eventId,
        p_provider_reference: verified.reference,
        p_plan_code: meta.plan_code,
        p_amount_minor: verified.amount,
        p_currency: verified.currency,
        p_renewal_mode: renewal
      })
    }
  );

  return typeof result === "string" ? result : "rpc_error";
}

async function verifyReturn(request, env) {
  const user = await requireUser(request, env);

  if (!user) {
    return json({ error: "Sign in required." }, 401);
  }

  if (!env.PAYSTACK_SECRET_KEY) {
    return json(
      {
        error:
          "Paystack is not configured on the payment Worker."
      },
      503
    );
  }

  const body = await request.json().catch(function () {
    return {};
  });

  const reference = String(body.reference || "").trim();

  if (!reference) {
    return json({ error: "Missing payment reference." }, 400);
  }

  const verified = await verifyPaystack(env, reference);

  if (!verified.ok) {
    return json(
      { error: "Paystack has not confirmed this payment." },
      402
    );
  }

  if (
    !verified.metadata ||
    verified.metadata.user_id !== user.id
  ) {
    return json(
      {
        error:
          "This payment does not belong to the signed-in account."
      },
      403
    );
  }

  const applied = await applyPayment(
    env,
    verified,
    {
      id: "return:" + reference,
      data: { id: reference }
    }
  );

  return json({
    result: applied,
    reference: verified.reference
  });
}

/**
 * Returns the signed-in user's trial and subscription status.
 * The frontend's existing trial_ends_at property is preserved.
 */
async function status(request, env) {
  const user = await requireUser(request, env);

  if (!user) {
    return json({ error: "Sign in required." }, 401);
  }

  const userId = encodeURIComponent(user.id);

  const [usageResult, subscriptionResult] = await Promise.all([
    supabase(
      env,
      "/rest/v1/usage?user_id=eq." +
        userId +
        "&select=trial_ends_at&limit=1"
    ),
    supabase(
      env,
      "/rest/v1/subscriptions?user_id=eq." +
        userId +
        "&select=status,expires_at,plan_code,renewal_mode&limit=1"
    )
  ]);

  if (
    !Array.isArray(usageResult) ||
    !Array.isArray(subscriptionResult)
  ) {
    return json(
      {
        error:
          "Could not retrieve subscription status from the database."
      },
      502
    );
  }

  const usage = usageResult[0] || null;
  const subscription = subscriptionResult[0] || null;
  const trialEndsAt = usage?.trial_ends_at || null;

  return json({
    trial_ends_at: trialEndsAt,
    trialEndsAt: trialEndsAt,
    subscription: subscription,
    plans: publicPlans(env),
    recurringEnabled: recurringEnabled(env)
  });
}

async function verifyPaystack(env, reference) {
  if (!env.PAYSTACK_SECRET_KEY) {
    return { ok: false };
  }

  const res = await fetch(
    "https://api.paystack.co/transaction/verify/" +
      encodeURIComponent(reference),
    {
      headers: {
        Authorization: "Bearer " + env.PAYSTACK_SECRET_KEY
      }
    }
  );

  const data = await res.json().catch(function () {
    return {};
  });

  if (
    !res.ok ||
    !data.status ||
    !data.data ||
    data.data.status !== "success"
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    reference: data.data.reference,
    amount: data.data.amount,
    currency: data.data.currency,
    metadata: data.data.metadata || {}
  };
}

async function requireUser(request, env) {
  const header =
    request.headers.get("Authorization") || "";

  const token = header.replace(/^Bearer\s+/i, "");

  if (!token || !env.SUPABASE_URL ||
      !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const res = await fetch(
    env.SUPABASE_URL + "/auth/v1/user",
    {
      headers: {
        Authorization: "Bearer " + token,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY
      }
    }
  );

  if (!res.ok) {
    return null;
  }

  const user = await res.json().catch(function () {
    return null;
  });

  return user && user.id ? user : null;
}

async function supabase(env, path, options) {
  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return null;
  }

  const res = await fetch(
    env.SUPABASE_URL + path,
    {
      method: (options && options.method) || "GET",
      headers: Object.assign(
        {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization:
            "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json"
        },
        (options && options.headers) || {}
      ),
      body: options && options.body
    }
  );

  const result = await res.json().catch(function () {
    return null;
  });

  if (!res.ok) {
    // Do not disguise database errors as an empty result.
    return null;
  }

  return result;
}

async function hmac(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-512"
    },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body)
  );

  return Array.from(new Uint8Array(sig))
    .map(function (b) {
      return b.toString(16).padStart(2, "0");
    })
    .join("");
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) {
    return false;
  }

  let out = 0;

  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return out === 0;
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function cors(response) {
  const headers = new Headers(response.headers);

  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type"
  );
  headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  return new Response(response.body, {
    status: response.status,
    headers: headers
  });
}
