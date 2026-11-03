const puppeteer = require('puppeteer-core');
const { setup, seed, sleep, UID } = require('./p2lib');
const base = 'http://localhost:3000';
const out = '/workspace/next-shots/polish/review'; require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const pages = process.env.ONLY ? process.env.ONLY.split(',').map((x) => [x, 1]) : [['/', 0], ['/app', 1], ['/new', 1], ['/records', 1], ['/sales', 1], ['/customers', 1], ['/billing', 1], ['/notifications', 1], ['/admin', 1], ['/signin', 0], ['/about', 0], ['/privacy-policy', 0], ['/terms', 0], ['/nope', 0], ['/r?t=abcdefgh12', 0], ['/reset', 0]];
  for (const w of [375, 1280]) for (const [p, si] of pages) {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.setViewport({ width: w, height: w === 375 ? 812 : 900, isMobile: w === 375, hasTouch: w === 375 });
    await setup(page, { signedIn: !!si, adminRows: [] });
    await page.evaluateOnNewDocument((k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, 'rp_plan_notice_' + UID, new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date()));
    if (si) await seed(page, base);
    const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await page.goto(base + p, { waitUntil: 'networkidle0' }); await sleep(1800);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const name = (p.replace(/[/?=]/g, '_') || 'home');
    await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: w === 375 });
    console.log(w, p, 'scrollWidth=' + sw + (sw > w ? '  OVERFLOW' : ''), errs.length ? 'ERR ' + JSON.stringify(errs) : '');
    await ctx.close();
  }
  await browser.close();
})();
