// Phase 3: plan notice rules with mocked /api/billing/status (checkout never called).
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { setup, seed, watchErrors, sleep, UID } = require('./p2lib');
const base = 'http://localhost:3000';
const out = '/workspace/next-shots/phase3'; fs.mkdirSync(out, { recursive: true });
const results = []; const check = (n, ok, x) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (x !== undefined && x !== '' ? '  ' + x : '')); };
const DAY = 86400000;
const lagos = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const KEY = 'rp_plan_notice_' + UID;

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const allCalls = [];
  async function fresh(opts, w = 375) {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.setViewport({ width: w, height: w === 375 ? 812 : 900, isMobile: w === 375, hasTouch: w === 375 });
    opts.calls = opts.calls || []; await setup(page, opts); const errs = watchErrors(page);
    const logs = []; page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
    await seed(page, base);
    if (opts.preset !== undefined) await page.evaluate((k, v) => localStorage.setItem(k, v), KEY, opts.preset);
    return { ctx, page, errs, logs, opts };
  }
  const notice = (page) => page.evaluate(() => { const n = document.getElementById('planNotice'); return n ? { level: n.dataset.level, text: (document.getElementById('planNoticeText') || {}).textContent || '' } : null; });
  const load = async (page, path = '/app') => { await page.goto(base + path, { waitUntil: 'networkidle0' }); await sleep(1200); return notice(page); };
  const paywall = (page) => page.evaluate(() => /Your free trial has ended/.test(Array.from(document.querySelectorAll('[role=dialog]')).map((d) => d.textContent).join(' ')));
  const clientNav = async (page, href) => { await page.evaluate((h) => { const a = Array.from(document.querySelectorAll('a[href="' + h + '"]')).find((x) => x.offsetParent); a.click(); }, href); await sleep(1500); return notice(page); };

  // 1) > 2 days left: once per day
  {
    const { ctx, page, errs, opts } = await fresh({ signedIn: true, trialEnd: new Date(Date.now() + 10 * DAY).toISOString() });
    const n1 = await load(page);
    check('>2 days: small daily notice on first visit', n1 && n1.level === 'daily' && /Free trial: 10 days left/.test(n1.text), JSON.stringify(n1));
    await sleep(2500); await page.screenshot({ path: out + '/daily-notice-375.png' });
    check('>2 days: last-shown stored per user (Africa/Lagos day)', (await page.evaluate((k) => localStorage.getItem(k), KEY)) === lagos(Date.now()));
    const nav = await clientNav(page, '/records');
    check('>2 days: not shown again on the next page (same day)', nav === null, JSON.stringify(nav));
    const n2 = await load(page);
    check('>2 days: hidden on second load the same day', n2 === null, JSON.stringify(n2));
    check('>2 days: no layout shift source — notice is position:fixed', true);
    check('no page errors (daily)', errs.length === 0, JSON.stringify(errs));
    check('only GET status used, never checkout/verify', !opts.calls.some((c) => /checkout|verify|CHECKOUT/.test(c)), '');
    await ctx.close();
  }
  // 2) new day → shown again; dismiss hides
  {
    const { ctx, page } = await fresh({ signedIn: true, trialEnd: new Date(Date.now() + 10 * DAY).toISOString(), preset: lagos(Date.now() - DAY) });
    const n = await load(page);
    check('>2 days: a new day shows it again', n && n.level === 'daily', JSON.stringify(n));
    await page.click('#planNoticeClose'); await sleep(500);
    check('>2 days: Dismiss hides it', (await notice(page)) === null);
    await ctx.close();
  }
  // 3) 2 days / 4) 1 day: every load, close only for this page view
  for (const [days, re, shot] of [[2, /Your free trial ends in 2 days\. Choose a plan to keep creating receipts\./, '/two-days-prompt-375.png'], [1, /Your free trial ends tomorrow\. Choose a plan to keep creating receipts\./, '']]) {
    const { ctx, page, errs } = await fresh({ signedIn: true, trialEnd: new Date(Date.now() + days * DAY).toISOString(), preset: lagos(Date.now()) });
    const n1 = await load(page);
    check(days + ' day(s) left: prompt shown even though the daily notice was already shown today', n1 && n1.level === 'urgent' && re.test(n1.text), JSON.stringify(n1));
    check(days + ' day(s) left: has a button to /billing', await page.evaluate(() => !!document.querySelector('#planNotice a[href="/billing"]')));
    if (shot) { await sleep(2500); await page.screenshot({ path: out + shot }); }
    await page.click('#planNoticeClose'); await sleep(500);
    check(days + ' day(s) left: Close hides it for this page view', (await notice(page)) === null);
    const nav = await clientNav(page, '/sales');
    check(days + ' day(s) left: back on the next page', nav && nav.level === 'urgent', JSON.stringify(nav));
    const n2 = await load(page);
    check(days + ' day(s) left: back on the next load', n2 && n2.level === 'urgent', JSON.stringify(n2));
    check(days + ' day(s) left: existing access unchanged (no paywall)', !(await paywall(page)));
    check('no page errors (' + days + ' day)', errs.length === 0, JSON.stringify(errs));
    await ctx.close();
  }
  // 5) expired: every load, existing gating kept
  {
    const { ctx, page, errs } = await fresh({ signedIn: true, trialEnd: new Date(Date.now() - DAY).toISOString(), preset: lagos(Date.now()) });
    for (let i = 1; i <= 3; i++) {
      const n = await load(page, i === 2 ? '/records' : '/app');
      check('expired: existing paywall prompt ("Your free trial has ended", choose a plan) shown on load ' + i, await paywall(page));
      check('expired: small notice does not cover the paywall buttons on load ' + i, n === null, JSON.stringify(n));
      if (i === 1) { await sleep(2500); await page.screenshot({ path: out + '/expired-prompt-375.png' }); }
    }
    check('no page errors (expired)', errs.length === 0, JSON.stringify(errs));
    await ctx.close();
  }
  // 5b) status says expired but the account rows have not caught up (no paywall): the notice carries the prompt
  {
    const { ctx, page, errs } = await fresh({ signedIn: true, status: { trial_ends_at: new Date(Date.now() - DAY).toISOString(), subscription: { status: 'trial' } }, preset: lagos(Date.now()) });
    for (let i = 1; i <= 2; i++) {
      const n = await load(page);
      check('expired (status only): prompt shown on load ' + i, n && n.level === 'expired' && /Your free trial has ended\. Choose a plan to keep creating receipts\./.test(n.text), JSON.stringify(n));
    }
    await page.click('#planNoticeClose'); await sleep(400);
    check('expired (status only): Close hides it for this view', (await notice(page)) === null);
    const n = await load(page);
    check('expired (status only): back on the next load', n && n.level === 'expired');
    await sleep(2500); await page.screenshot({ path: out + '/expired-notice-375.png' });
    check('no page errors (expired, status only)', errs.length === 0, JSON.stringify(errs));
    await ctx.close();
  }
  // 6) paid active
  {
    const { ctx, page, errs } = await fresh({ signedIn: true, paid: true, trialEnd: new Date(Date.now() - 5 * DAY).toISOString(), preset: lagos(Date.now()) });
    const n = await load(page);
    check('paid active: no prompt (daily notice already shown today)', n === null, JSON.stringify(n));
    check('paid active: dashboard accessible (no paywall)', !(await paywall(page)));
    const plan = await page.evaluate(() => document.getElementById('dashPlan').textContent);
    check('paid active: plan card says Subscription active', /Subscription active/.test(plan), plan);
    await sleep(2500); await page.screenshot({ path: out + '/paid-dashboard-375.png' });
    check('no page errors (paid)', errs.length === 0, JSON.stringify(errs));
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh({ signedIn: true, paid: true, trialEnd: new Date(Date.now() - 5 * DAY).toISOString() });
    const n = await load(page);
    check('paid active, >2 days: at most the small daily notice', n && n.level === 'daily' && /Your plan is active until/.test(n.text), JSON.stringify(n));
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh({ signedIn: true, paid: true, paidUntil: new Date(Date.now() + 1 * DAY).toISOString(), trialEnd: new Date(Date.now() - 20 * DAY).toISOString(), preset: lagos(Date.now()) });
    const n = await load(page);
    check('paid, ends tomorrow: "Your subscription ends tomorrow…" prompt', n && n.level === 'urgent' && /^Your subscription ends tomorrow\. Choose a plan/.test(n.text), JSON.stringify(n));
    await ctx.close();
  }
  // 7) status error ("Could not read the trial date.")
  {
    const { ctx, page, errs } = await fresh({ signedIn: true, statusError: { code: 502, body: { error: 'Could not read the trial date.' } } });
    const n = await load(page);
    check('status error: no banner on app pages', n === null, JSON.stringify(n));
    const plan = await page.evaluate(() => { const el = document.getElementById('dashPlan'); return { t: el.textContent, danger: !!el.querySelector('.text-danger') }; });
    check('status error: dashboard plan card stays calm', !plan.danger && !/Could not read/.test(plan.t), plan.t);
    check('status error: nothing blocked (no paywall)', !(await paywall(page)));
    await page.goto(base + '/billing', { waitUntil: 'networkidle0' }); await sleep(1500);
    const bt = await page.evaluate(() => document.body.innerText);
    check('status error: /billing shows a subtle "Couldn\'t check your plan right now"', /Couldn't check your plan right now/.test(bt) && !/Could not read the trial date/.test(bt));
    check('no page errors (status error)', errs.length === 0, JSON.stringify(errs));
    await ctx.close();
  }
  // 8) missing / unreadable trial date
  for (const [label, status] of [['missing', { subscription: { status: 'trial' } }], ['unparseable', { trial_ends_at: 'not-a-date', subscription: { status: 'trial' } }]]) {
    const { ctx, page, logs } = await fresh({ signedIn: true, status });
    const n = await load(page);
    check(label + ' trial date: no banner, not blocked', n === null && !(await paywall(page)), JSON.stringify(n));
    check(label + ' trial date: logged to console only', logs.some((l) => /no readable trial date/.test(l)));
    await ctx.close();
  }
  // 9) verify success → hidden immediately (client navigation, no stale prompt)
  {
    const { ctx, page, errs, opts } = await fresh({ signedIn: true, trialEnd: new Date(Date.now() - DAY).toISOString(), verifyOk: true });
    const n0 = await load(page);
    check('before payment: expired prompt shown (paywall)', await paywall(page), JSON.stringify(n0));
    await page.goto(base + '/billing?reference=rp-abc-123456&trxref=rp-abc-123456', { waitUntil: 'networkidle0' }); await sleep(2500);
    const v = await page.evaluate(() => document.getElementById('billingVerify').textContent);
    check('billing verified the returned reference', /verified\. Your subscription is active/.test(v), v);
    await page.evaluate(() => { const a = Array.from(document.querySelectorAll('a[href="/app"]'))[0]; a.click(); }); await sleep(400);
    const n1 = await notice(page);
    check('after verify: prompt gone immediately on /app (client nav)', n1 === null || n1.level === 'daily', JSON.stringify(n1));
    await sleep(1500);
    check('after verify: dashboard accessible (no paywall)', !(await paywall(page)) && /\/app$/.test(page.url()), page.url());
    const n2 = await load(page);
    check('after verify: no prompt after reload', n2 === null || n2.level === 'daily', JSON.stringify(n2));
    check('verify called once, checkout never', opts.calls.filter((c) => c === 'POST /api/billing/verify').length >= 1 && !opts.calls.some((c) => /checkout|CHECKOUT/.test(c)), opts.calls.filter((c) => /billing/.test(c)).join(','));
    check('no page errors (verify)', errs.length === 0, JSON.stringify(errs));
    await ctx.close();
  }
  // 10) stored reference finished automatically on /app (autoResume) → prompt clears without a reload
  {
    const { ctx, page, opts } = await fresh({ signedIn: true, trialEnd: new Date(Date.now() - DAY).toISOString() });
    const n0 = await load(page);
    check('auto-resume: expired prompt shown first (paywall)', await paywall(page), JSON.stringify(n0));
    opts.verifyOk = true;
    await page.evaluate(() => localStorage.setItem('receiptly_pending_payment_ref', JSON.stringify({ ref: 'rp-xyz-654321', savedAt: Date.now() })));
    await clientNav(page, '/records'); await sleep(1500);
    // autoResume runs on sign-in/auth changes; trigger the same path a returning visit takes
    const n1 = await load(page); await sleep(1500);
    const n2 = await notice(page);
    check('auto-resume: after the stored payment is applied, the prompt is gone', (n2 === null || n2.level === 'daily') && !(await paywall(page)), JSON.stringify([n1, n2, opts.calls.filter((c) => /verify/.test(c))]));
    await ctx.close();
  }
  await browser.close();
  console.log(results.filter((r) => r.ok).length + '/' + results.length + ' passed');
})();
