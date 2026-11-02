// Sales + customers parity: old sales.html / customers.html vs new /sales /customers with the same seeded receipts.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { d, setup, seed, watchErrors, sleep } = require('./p2lib');
const NEW = 'http://localhost:3000', OLD = 'http://localhost:3001';
const out = '/workspace/next-shots/phase2/tests'; fs.mkdirSync(out, { recursive: true });
const results = []; const check = (n, ok, x) => { results.push({ n, ok: !!ok, x }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok || !x ? '' : '\n     ' + x)); };

const SCENARIOS = [
  ['daily / today (default)', []],
  ['weekly button', [['click', '[data-sales-view="weekly"]']]],
  ['monthly button', [['click', '[data-sales-view="monthly"]']]],
  ['preset yesterday', [['val', '#salesPreset', 'yesterday']]],
  ['preset last week', [['val', '#salesPreset', 'lastWeek']]],
  ['preset last month', [['val', '#salesPreset', 'lastMonth']]],
  ['preset this week', [['val', '#salesPreset', 'week']]],
  ['preset this month', [['val', '#salesPreset', 'month']]],
  ['daily, specific day = yesterday', [['val', '#salesDay', d(-1)]]],
  ['custom range last 60 days', [['val', '#salesPreset', 'custom'], ['val', '#salesFrom', d(-60)], ['val', '#salesTo', d(0)]]],
  ['custom + product search "rice"', [['val', '#salesPreset', 'custom'], ['val', '#salesFrom', d(-60)], ['val', '#salesTo', d(0)], ['val', '#salesProduct', 'rice']]],
  ['custom + payment status partially paid', [['val', '#salesPreset', 'custom'], ['val', '#salesFrom', d(-60)], ['val', '#salesTo', d(0)], ['val', '#salesPayStatus', 'PARTIALLY PAID']]],
  ['custom + unpaid', [['val', '#salesPreset', 'custom'], ['val', '#salesFrom', d(-60)], ['val', '#salesTo', d(0)], ['val', '#salesPayStatus', 'UNPAID']]],
  ['monthly then preset yesterday (quirk)', [['click', '[data-sales-view="monthly"]'], ['val', '#salesPreset', 'yesterday']]],
  ['weekly then preset last month', [['click', '[data-sales-view="weekly"]'], ['val', '#salesPreset', 'lastMonth']]],
];
const IDS = ['salesPeriod', 'salesTotal', 'salesPaid', 'salesOut', 'salesCount', 'salesAvg', 'salesRefunded', 'salesPaidN', 'salesPartN', 'salesUnpaidN', 'productUnits', 'productSales', 'productCollected', 'productOutstanding'];

async function act(page, steps) {
  for (const [kind, sel, v] of steps) {
    if (kind === 'click') { await page.click(sel); await sleep(250); continue; }
    await page.evaluate((sel, v) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error('missing ' + sel);
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, sel, v);
    await sleep(250);
  }
  await sleep(400);
}
async function readSales(page) {
  return page.evaluate((IDS) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const o = {};
    IDS.forEach((id) => { const el = document.getElementById(id); o[id] = el ? norm(el.textContent) : '(missing)'; });
    const rows = (id) => { const el = document.getElementById(id); return el ? Array.from(el.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((c) => norm(c.textContent)).join(' | ')) : []; };
    o.productRows = rows('productBody'); o.receiptRows = rows('salesBody');
    const db = document.getElementById('dayBreakdown');
    o.days = db ? Array.from(db.children).map((c) => Array.from(c.children).map((x) => norm(x.textContent)).join(' | ')) : [];
    return o;
  }, IDS);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  async function open(base, path, w = 1280) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: w, height: 900 });
    await setup(page, { signedIn: true });
    const errs = watchErrors(page);
    await seed(page, base);
    await page.goto(base + path, { waitUntil: 'networkidle0' }); await sleep(2500);
    return { ctx, page, errs };
  }
  const report = [];
  // ---- Sales
  for (const [name, steps] of SCENARIOS) {
    const o = await open(OLD, '/sales.html'); const n = await open(NEW, '/sales');
    await act(o.page, steps); await act(n.page, steps);
    const a = await readSales(o.page), b = await readSales(n.page);
    const diffs = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => k + ': OLD=' + JSON.stringify(a[k]) + ' NEW=' + JSON.stringify(b[k]));
    report.push({ scenario: name, old: a, new: b, diffs });
    check('sales parity: ' + name + ' (' + a.salesPeriod + ', total ' + a.salesTotal + ', ' + a.receiptRows.length + ' rows)', diffs.length === 0, diffs.join('\n     '));
    if (name === 'custom range last 60 days') { await o.page.screenshot({ path: out + '/sales-old-custom.png', fullPage: true }); await n.page.screenshot({ path: out + '/sales-new-custom.png', fullPage: true }); }
    check('no page errors on new /sales (' + name + ')', n.errs.length === 0, JSON.stringify(n.errs));
    await o.ctx.close(); await n.ctx.close();
  }
  // ---- Customers
  const readCust = (page) => page.evaluate(() => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const body = document.getElementById('custBody');
    const rows = body ? Array.from(body.querySelectorAll('tr')).map((tr) => Array.from(tr.children).slice(0, 8).map((c) => norm(c.textContent)).join(' | ')) : [];
    const empty = document.getElementById('custEmpty');
    const emptyText = empty && !empty.hidden && empty.offsetParent !== null ? norm(empty.querySelector('h2').textContent) : '';
    return { rows, emptyText };
  });
  for (const q of ['', 'ada', '0803', 'example.com', 'nobody']) {
    const o = await open(OLD, '/customers.html'); const n = await open(NEW, '/customers');
    if (q) { await act(o.page, [['val', '#custSearch', q]]); await act(n.page, [['val', '#custSearch', q]]); await sleep(600); }
    const a = await readCust(o.page), b = await readCust(n.page);
    const same = JSON.stringify(a) === JSON.stringify(b);
    check('customers parity: search "' + q + '" (' + a.rows.length + ' rows' + (a.emptyText ? ', "' + a.emptyText + '"' : '') + ')', same, 'OLD=' + JSON.stringify(a) + '\n     NEW=' + JSON.stringify(b));
    report.push({ customers: q, old: a, new: b });
    if (!q) {
      // Customer record document for "Ada Obi"
      await o.page.click('[data-cust-view="ada obi"]'); await sleep(800);
      await n.page.evaluate(() => { const tr = Array.from(document.querySelectorAll('#custBody tr')).find((r) => r.textContent.includes('Ada Obi')); tr.querySelector('button').click(); }); await sleep(1200);
      const docText = (p) => p.evaluate(() => document.getElementById('custRecordDoc').textContent.replace(/\s+/g, ' ').trim());
      const da = await docText(o.page), db = await docText(n.page);
      check('customer record document identical (Ada Obi)', da === db, 'OLD=' + da + '\n     NEW=' + db);
      await n.page.screenshot({ path: out + '/customer-record-new.png' });
      report.push({ customerDoc: { old: da, new: db } });
    }
    check('no page errors on new /customers ("' + q + '")', n.errs.length === 0, JSON.stringify(n.errs));
    await o.ctx.close(); await n.ctx.close();
  }
  await browser.close();
  fs.writeFileSync(out + '/parity-results.json', JSON.stringify({ results, report }, null, 2));
  console.log(results.filter((r) => r.ok).length + '/' + results.length + ' passed');
})();
