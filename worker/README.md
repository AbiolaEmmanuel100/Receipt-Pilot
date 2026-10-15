# Billing Worker

This is a separate script-capable Cloudflare Worker. The current static-assets Worker cannot hold secrets.

## Required secrets

Set these with `wrangler secret put`. Do not commit them.

- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_WEBHOOK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Optional

- `PAYSTACK_RECURRING_ENABLED=true` only after Paystack plans exist and you have tested recurring charges.
- `PAYSTACK_PLAN_MONTHLY`, `PAYSTACK_PLAN_QUARTERLY`, `PAYSTACK_PLAN_SEMI_ANNUAL`, `PAYSTACK_PLAN_ANNUAL`

## Frontend

Set `billingWorkerUrl` in `js/config.js` to this Worker's public URL. That URL is not a secret.

## Paystack dashboard

Point the webhook to `https://YOUR-WORKER/api/billing/webhook`.

Manual renewal is the default. Automatic renewal requires explicit user choice and a configured Paystack plan. A one-time payment is not consent for future charges.
