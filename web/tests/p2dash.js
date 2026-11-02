// Dashboard figures vs seeded data + Phase 2 screenshots (dashboard, history, sales, customers) at 375/1280.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { SEED, d, setup, seed, watchErrors, sleep } = require('./p2lib');
const base = process.env.BASE || 'http://localhost:3000';
const out = '/workspace/next-shots/phase2';
const results = []; const check = (n, ok, x) => { results.push({ n, ok: !!ok, x }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const fmt = (n) => (n < 0 ? '-' : '') + '₦' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Independent expected figures (written from the brief's rules, not from app code).
function expected() {
  const today = d(0);
  const now = new Date(); const dow = now.getDay(); const mon = new Date(now); mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  const p = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  const weekFrom = p(mon), monthFrom = p(new Date(now.getFullYear(), now.getMonth(), 1));
  const live = SEED.filter((r) => !r.isDraft && !r.voided && !r.refunded);
  const inR = (r, a, b) => r.date >= a && r.date <= b;
  const sum = (l, k) => l.reduce((s, r) => s + r[k], 0);
  const t = live.filter((r) => inR(r, today, today)), w = live.filter((r) => inR(r, weekFrom, today)), m = live.filter((r) => inR(r, monthFrom, today));
  const recent = SEED.filter((r) => !r.isDraft).sort((a, b) => (b.date + 'T' + b.time).localeCompare(a.date + 'T' + a.time)).slice(0, 5).map((r) => r.number);
  return {
    today: fmt(sum(t, 'grand')), todayN: t.length, weekN: w.length, weekSales: fmt(sum(w, 'grand')), month: fmt(sum(m, 'grand')), monthPaid: fmt(sum(m, 'paid')),
    out: fmt(Math.max(0, sum(live, 'grand') - sum(live, 'paid'))), recent,
  };
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const E = expected();
  console.log('expected', JSON.stringify(E));
  for (const w of [375, 1280]) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: w, height: w === 375 ? 812 : 900, isMobile: w === 375, hasTouch: w === 375, deviceScaleFactor: w === 375 ? 2 : 1 });
    const calls = [];
    await setup(page, { signedIn: true, calls });
    const errs = watchErrors(page);
    await seed(page, base);
    await page.goto(base + '/app', { waitUntil: 'networkidle0' }); await sleep(1800);
    const got = await page.evaluate(() => {
      const t = (id) => { const el = document.getElementById(id); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; };
      const card = (id) => { const el = document.getElementById(id); return el ? el.parentElement.textContent.replace(/\s+/g, ' ').trim() : ''; };
      return { url: location.pathname, name: t('dashName'), today: t('dashToday'), todayCard: card('dashToday'), week: t('dashWeek'), weekCard: card('dashWeek'), month: t('dashMonth'), monthCard: card('dashMonth'), out: t('dashOut'), plan: t('dashPlan'),
        recent: Array.from(document.querySelectorAll('#dashRecent li')).map((li) => (li.textContent.match(/RCT-\d+/) || [''])[0]) };
    });
    if (w === 375) {
      check('dashboard stays on /app when signed in', got.url === '/app', got.url);
      check('greeting shows business name', got.name === 'Test Biz Ltd', got.name);
      check('Sales today = ' + E.today + ' (' + E.todayN + ' receipts)', got.today === E.today && got.todayCard.includes(E.todayN + ' receipt'), got.todayCard);
      check('Receipts this week = ' + E.weekN + ', sales ' + E.weekSales, got.week === String(E.weekN) && got.weekCard.includes(E.weekSales), got.weekCard);
      check('Sales this month = ' + E.month + ', collected ' + E.monthPaid, got.month === E.month && got.monthCard.includes(E.monthPaid), got.monthCard);
      check('Yet to be paid (all) = ' + E.out, got.out === E.out, got.out);
      check('recent receipts = ' + E.recent.join(','), JSON.stringify(got.recent) === JSON.stringify(E.recent), got.recent.join(','));
      check('plan card uses /api/billing/status text', /^Trial ends .+\. Subscription: trial\.$/.test(got.plan || ''), got.plan);
      check('status endpoint called with GET only (no verify/checkout)', calls.includes('GET /api/billing/status') && !calls.some((c) => /verify|checkout|CHECKOUT/.test(c)), calls.filter((c) => c.includes('/api/')).join(','));
    }
    for (const [name, path, wait] of [['dashboard', '/app', 0], ['history', '/records', 0], ['sales', '/sales', 0], ['customers', '/customers', 0]]) {
      if (path !== '/app') { await page.goto(base + path, { waitUntil: 'networkidle0' }); await sleep(1800); }
      await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
      await page.screenshot({ path: `${out}/${name}-${w}-fold.png`, fullPage: false });
    }
    check('no console/page errors at ' + w + 'px (dashboard, history, sales, customers)', errs.length === 0, JSON.stringify(errs.slice(0, 4)));
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(out + '/dashboard-results.json', JSON.stringify(results, null, 2));
  console.log(results.filter((r) => r.ok).length + '/' + results.length + ' passed');
})();
