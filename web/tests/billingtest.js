// Mocked-fetch tests for /billing?reference=... (no real Worker, Supabase or Paystack calls).
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const base = process.env.BASE || 'http://localhost:3000';
const WORKER = 'https://receipt-pilot-billing.eabiolakayode.workers.dev';
const SUPA = 'https://xwmfkfcsyqgwtfjumubh.supabase.co';
const out = process.env.OUT || '/workspace/next-shots/billing-tests';
fs.mkdirSync(out, { recursive: true });
const REF = 'rp-test-ref-123456';
const UID = '11111111-2222-3333-4444-555555555555';
const future = Math.floor(Date.now() / 1000) + 3600;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: UID, exp: future, role: 'authenticated', email: 'test@example.com' }) + '.sig';
const user = { id: UID, email: 'test@example.com', aud: 'authenticated', role: 'authenticated', last_sign_in_at: new Date().toISOString(), user_metadata: {}, app_metadata: {} };
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: future, refresh_token: 'r', user };

const cases = [
  { name: 'processed', http: 200, body: { result: 'processed' }, expect: { text: 'verified. Your subscription is active', pending: 'gone' } },
  { name: 'already_processed', http: 200, body: { result: 'already_processed' }, expect: { text: 'verified. Your subscription is active', pending: 'gone' } },
  { name: '401', http: 401, body: { error: 'Unauthorized' }, expect: { text: 'Sign in to finish activating your payment (reference', pending: 'kept' } },
  { name: '400', http: 400, body: { error: 'Bad reference' }, expect: { text: 'was not activated.', error: 'Bad reference', pending: 'gone' } },
  { name: '404', http: 404, body: { error: 'Not found' }, expect: { text: 'was not activated.', pending: 'gone' } },
  { name: '422', http: 422, body: { error: 'Amount mismatch' }, expect: { text: 'was not activated.', pending: 'gone' } },
  { name: '402_failed', http: 402, body: { error: 'Payment failed', paystack_status: 'failed' }, expect: { text: 'was not activated.', pending: 'gone' } },
  { name: '402_abandoned', http: 402, body: { error: 'Abandoned', paystack_status: 'abandoned' }, expect: { text: 'was not activated.', pending: 'gone' } },
  { name: '402_pending', http: 402, body: { error: 'Not yet', paystack_status: 'ongoing' }, expect: { text: 'is not confirmed by Paystack yet', pending: 'kept' } },
  { name: '403', http: 403, body: { error: 'Belongs to another account' }, expect: { text: 'was not activated for this account', pending: 'holdFor' } },
  { name: '409', http: 409, body: { error: 'Needs review' }, expect: { text: 'needs a manual review', pending: 'review' } },
  { name: '500', http: 500, body: { error: 'Server error' }, expect: { text: 'is not activated yet.', error: 'Server error', pending: 'kept' } },
  { name: 'network', http: 0, body: null, expect: { text: 'is not activated yet.', error: 'Could not reach the billing service', pending: 'kept' } },
  { name: 'signed_out', http: 200, body: { result: 'processed' }, signedOut: true, expect: { text: 'Sign in to finish activating your payment (reference', pending: 'kept', noVerify: true } },
  { name: 'trxref_only', http: 200, body: { result: 'processed' }, query: '?trxref=' + REF, expect: { text: 'verified. Your subscription is active', pending: 'gone' } },
  { name: 'legacy_url_billing.html', http: 200, body: { result: 'processed' }, path: '/billing.html', expect: { text: 'verified. Your subscription is active', pending: 'gone' } },
  { name: 'invalid_reference', http: 200, body: { result: 'processed' }, query: '?reference=<bad>', expect: { text: '', pending: 'none', noVerify: true } },
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const results = [];
  for (const c of cases) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    const calls = []; const errs = []; const external = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = req.url();
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
      if (req.method() === 'OPTIONS' && (u.startsWith(WORKER) || u.startsWith(SUPA))) return req.respond({ status: 204, headers: cors });
      if (u.startsWith(WORKER)) {
        const path = new URL(u).pathname;
        calls.push({ method: req.method(), path, body: req.postData() || null, auth: (req.headers().authorization || '').slice(0, 12) });
        if (path === '/api/billing/verify') {
          if (c.http === 0) return req.abort('internetdisconnected');
          return req.respond({ status: c.http, headers: cors, contentType: 'application/json', body: JSON.stringify(c.body) });
        }
        if (path === '/api/billing/status') return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ trial_ends_at: new Date(Date.now() + 5 * 86400000).toISOString(), subscription: c.body && c.body.result ? { status: 'active', plan_code: 'monthly', expires_at: new Date(Date.now() + 30 * 86400000).toISOString() } : { status: 'trial' } }) });
        if (path === '/api/billing/plans') return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ plans: [{ code: 'monthly', label: 'Monthly', naira: 1500, months: 1 }, { code: 'quarterly', label: 'Quarterly', naira: 4275, months: 3 }, { code: 'semi_annual', label: 'Semi-annual', naira: 8100, months: 6 }, { code: 'annual', label: 'Annual', naira: 15300, months: 12 }] }) });
        if (path === '/api/billing/checkout') { calls.push({ CHECKOUT_CALLED: true }); return req.respond({ status: 500, headers: cors, body: '{}' }); }
        return req.respond({ status: 404, headers: cors, body: '{}' });
      }
      if (u.startsWith(SUPA)) {
        const path = new URL(u).pathname;
        if (path.startsWith('/auth/v1/user')) return req.respond({ status: c.signedOut ? 401 : 200, headers: cors, contentType: 'application/json', body: JSON.stringify(c.signedOut ? { msg: 'no' } : user) });
        if (path.startsWith('/auth/v1/token')) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(session) });
        return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '[]' });
      }
      if (!u.startsWith(base) && !u.startsWith('data:')) { external.push(u); }
      req.continue();
    });
    await page.evaluateOnNewDocument((sess, signedOut) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      localStorage.clear();
      if (!signedOut) localStorage.setItem('receiptly-auth', JSON.stringify(sess));
    }, session, !!c.signedOut);
    const url = base + (c.path || '/billing') + (c.query || '?reference=' + REF + '&trxref=' + REF);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    const state = await page.evaluate(() => ({
      url: location.pathname + location.search,
      verify: (document.getElementById('billingVerify') || {}).textContent || '',
      status: (document.getElementById('billingStatus') || {}).textContent || '',
      error: (document.getElementById('billingError') || {}).textContent || '',
      signIn: !!(document.getElementById('billingSignIn') && document.getElementById('billingSignIn').offsetParent),
      pending: localStorage.getItem('receiptly_pending_payment_ref'),
    }));
    await page.screenshot({ path: `${out}/${c.name}.png`, fullPage: false });
    const verifyCalls = calls.filter((x) => x.path === '/api/billing/verify');
    let pend = null; try { pend = JSON.parse(state.pending); } catch (e) {}
    const checks = [];
    const e = c.expect;
    if (e.text) checks.push(['verify text contains "' + e.text + '"', state.verify.includes(e.text)]);
    if (e.error) checks.push(['error contains "' + e.error + '"', state.error.includes(e.error)]);
    if (e.pending === 'gone') checks.push(['pending ref cleared', !state.pending]);
    if (e.pending === 'none') checks.push(['nothing stored', !state.pending]);
    if (e.pending === 'kept') checks.push(['pending ref kept', !!(pend && pend.ref === REF)]);
    if (e.pending === 'holdFor') checks.push(['pending holdFor=uid', !!(pend && pend.holdFor === UID)]);
    if (e.pending === 'review') checks.push(['pending review=true', !!(pend && pend.review === true)]);
    if (e.noVerify) checks.push(['verify NOT called', verifyCalls.length === 0]);
    else {
      checks.push(['verify called exactly once', verifyCalls.length === 1]);
      checks.push(['verify body is only {reference}', verifyCalls.length > 0 && verifyCalls[0].body === JSON.stringify({ reference: REF })]);
      checks.push(['Bearer token sent', verifyCalls.length > 0 && verifyCalls[0].auth.startsWith('Bearer ')]);
    }
    checks.push(['checkout never called', !calls.some((x) => x.CHECKOUT_CALLED)]);
    checks.push(['no page errors', errs.filter((x) => !/Failed to load resource/.test(x)).length === 0]);
    const pass = checks.every((x) => x[1]);
    results.push({ case: c.name, pass, state, checks, calls, errs, external });
    console.log((pass ? 'PASS ' : 'FAIL ') + c.name.padEnd(24) + ' verify="' + state.verify.slice(0, 90) + '"' + (pass ? '' : '\n   ' + checks.filter((x) => !x[1]).map((x) => x[0]).join('; ') + ' | state=' + JSON.stringify(state) + ' errs=' + JSON.stringify(errs)));
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(out + '/results.json', JSON.stringify(results, null, 2));
  console.log(results.filter((r) => r.pass).length + '/' + results.length + ' passed');
})();
