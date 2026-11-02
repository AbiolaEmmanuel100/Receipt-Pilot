# Billing Worker

This is a separate script-capable Cloudflare Worker. The current static-assets Worker cannot hold secrets.

## Required secrets

Set these with `wrangler secret put`. Do not commit them.

- `PAYSTACK_SECRET_KEY` (live `sk_live_...` in production)
- `SUPABASE_SERVICE_ROLE_KEY`

Plain variables (not secret): `SUPABASE_URL`, `SITE_ORIGIN=https://receipt-pilot.com`.

Do not set `PAYSTACK_WEBHOOK_SECRET`. Paystack signs webhooks (HMAC SHA-512 of
the raw body, header `x-paystack-signature`) with your secret key, so the Worker
verifies them with `PAYSTACK_SECRET_KEY` only and ignores any
`PAYSTACK_WEBHOOK_SECRET`.

`SITE_ORIGIN` builds the Paystack `callback_url`. If it is missing or not an
`https://host` origin, the Worker uses `https://receipt-pilot.com`.

## Optional

- `PAYSTACK_RECURRING_ENABLED=true` only after Paystack plans exist and you have tested recurring charges.
- `PAYSTACK_PLAN_MONTHLY`, `PAYSTACK_PLAN_QUARTERLY`, `PAYSTACK_PLAN_SEMI_ANNUAL`, `PAYSTACK_PLAN_ANNUAL`

## Frontend

Set `billingWorkerUrl` in `js/config.js` to this Worker's public URL. That URL is not a secret.

## Paystack dashboard

Point the **Live** webhook to `https://receipt-pilot-billing.eabiolakayode.workers.dev/api/billing/webhook`.

Webhook responses: `200` for processed, duplicate (`already_processed`), ignored, rejected or `needs_manual_review` events (a retry cannot change them; all are logged). `500` when Paystack or Supabase could not be reached or the database call failed, so Paystack retries. `401` for a bad signature.

A verified payment whose metadata has no `user_id`/`plan_code` is never activated automatically. It is logged as `needs_manual_review`.

Manual renewal is the default. Automatic renewal requires explicit user choice and a configured Paystack plan. A one-time payment is not consent for future charges.
