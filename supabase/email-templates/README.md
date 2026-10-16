# Receipt Pilot email templates

These HTML files are source copies maintained in GitHub. They are not applied automatically to the hosted Supabase project.

## Apply them in Supabase

1. Open the Supabase project `xwmfkfcsyqgwtfjumubh`.
2. Go to Authentication → Email Templates.
3. Open Confirm signup. Set the subject to `Welcome to Receipt Pilot — Confirm Your Email` and paste the full contents of `confirm-signup.html` into the message body.
4. Open Reset Password. Set the subject to `Reset Your Receipt Pilot Password` and paste the full contents of `reset-password.html` into the message body.
5. Open Magic Link. Set the subject to `Your Receipt Pilot sign-in code` and paste the full contents of `magic-link.html` into the message body.
6. Save the templates. Test signup, password recovery, and email-code sign-in.
7. The sender display name and SMTP configuration are separate settings. Configure those later after you have a business email address.

The signup and reset templates use `{{ .ConfirmationURL }}`. The magic-link template uses `{{ .Token }}` for the code and `{{ .ConfirmationURL }}` only as a fallback link. Do not replace those variables with normal website links.

## Redirect configuration

The confirmation and recovery links only work if Authentication → URL Configuration allows the destinations.

Production website: `https://receipt-pilot.com`

Recommended settings:

- Site URL: `https://receipt-pilot.com`
- Redirect URLs:
  - `https://receipt-pilot.com/**`
  - `https://receipt-pilot.com/reset.html`
  - `https://heroic-empanada-718ebb.netlify.app/**`
  - `https://heroic-empanada-718ebb.netlify.app/reset.html`

Do not leave the Site URL as `http://localhost:3000`.
