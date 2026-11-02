const puppeteer = require('puppeteer-core');
const fs = require('fs');
const base = process.argv[2] || 'http://localhost:3000';
const out = process.argv[3] || '/workspace/next-shots';
const pages = (process.argv[4] || '/,/new,/records,/signin,/billing,/r?t=invalidtoken123,/reset,/about,/privacy-policy,/terms,/nope').split(',');
fs.mkdirSync(out, { recursive: true });
const report = [];
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  for (const p of pages) for (const w of [375, 1280]) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText));
    await page.setViewport({ width: w, height: w === 375 ? 812 : 900, isMobile: w === 375, hasTouch: w === 375, deviceScaleFactor: w === 375 ? 2 : 1 });
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('receiptly_install_dismiss', '1'); localStorage.setItem('receiptly_ios_install_dismiss', '1'); } catch (e) {} });
    try { await page.goto(base + p, { waitUntil: 'networkidle2', timeout: 30000 }); } catch (e) { errs.push('goto: ' + e.message); }
    await new Promise((r) => setTimeout(r, 1500));
    const name = (p === '/' ? 'home' : p.slice(1).split('?')[0].replace(/\W/g, '_')) + '-' + w;
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    await page.screenshot({ path: `${out}/${name}-fold.png`, fullPage: false });
    report.push({ page: p, width: w, url: page.url(), errors: errs });
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(out + '/console-report.json', JSON.stringify(report, null, 2));
  for (const r of report) console.log(r.width, r.page, '->', r.url.replace(base, ''), r.errors.length ? JSON.stringify(r.errors) : 'no errors');
})();
