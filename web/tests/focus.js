// Keyboard focus audit: Tab through each page; every focused control must show a visible focus indicator.
const puppeteer = require('puppeteer-core'); const { setup, seed, sleep, UID } = require('./p2lib');
const base = process.env.BASE || 'http://localhost:3000';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] }); let bad = 0, total = 0;
  for (const [p, si, w] of [['/', 0, 1280], ['/app', 1, 1280], ['/new', 1, 1280], ['/records', 1, 1280], ['/signin', 0, 1280], ['/app', 1, 375], ['/new', 1, 375], ['/billing', 1, 1280], ['/customers', 1, 1280]]) {
    const ctx = await b.createBrowserContext(); const page = await ctx.newPage(); await page.setViewport({ width: w, height: 900 });
    await setup(page, { signedIn: !!si }); await page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), 'rp_plan_notice_' + UID, new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date())); if (si) await seed(page, base);
    await page.goto(base + p, { waitUntil: 'networkidle0' }); await sleep(1200);
    const misses = new Set(); let n = 0;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab'); await sleep(60);
      const r = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e); const has = (x) => { const q = getComputedStyle(x); return (q.outlineStyle !== 'none' && parseFloat(q.outlineWidth) > 0) || (q.boxShadow && q.boxShadow !== 'none' && !/^rgba\(16, 24, 40, 0\.04\) 0px 1px 2px 0px$/.test(q.boxShadow)); }; const ring = has(e) || (e.parentElement && e.parentElement.matches(':focus-within') && has(e.parentElement)); return { ok: !!ring, d: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + ' "' + (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30) + '"' }; });
      if (!r) continue; n++; if (!r.ok) misses.add(r.d);
    }
    total += n; bad += misses.size; console.log(w, p, `${n} tab stops`, misses.size ? 'NO-RING ' + JSON.stringify([...misses]) : 'all visible');
    await ctx.close();
  }
  await b.close(); console.log(`\n${bad} controls without a visible focus indicator`);
})();
