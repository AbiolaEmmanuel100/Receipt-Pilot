// Phone field screenshots + width measurements (customer and business phone on /new).
const puppeteer = require('puppeteer-core');
const label = process.argv[2], base = process.argv[3];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  for (const w of (process.env.WIDTHS || '375').split(',').map(Number)) {
    const page = await b.newPage(); await page.setViewport({ width: w, height: 900, isMobile: w < 1024, hasTouch: w < 1024, deviceScaleFactor: 2 });
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('receiptly_install_dismiss', '1'); localStorage.setItem('receiptly_ios_install_dismiss', '1'); } catch (e) {} });
    await page.goto(base + '/new', { waitUntil: 'networkidle0' }); await new Promise((r) => setTimeout(r, 1500));
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => /Add logo, address/.test(x.textContent)); if (b) b.click(); }); await new Promise((r) => setTimeout(r, 500));
    if (process.env.LONG) await page.evaluate(() => { for (const s of document.querySelectorAll('select[aria-label$="country code"]')) { const o = Array.from(s.options).sort((a, b) => b.text.length - a.text.length)[0]; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); } });
    await new Promise((r) => setTimeout(r, 400));
    const m = await page.evaluate(() => ['custPhone', 'bizPhone'].map((id) => { const inp = document.getElementById(id); if (!inp) return { id, missing: true }; const sel = inp.parentElement.querySelector('select'); const r1 = sel.getBoundingClientRect(), r2 = inp.getBoundingClientRect(); return { id, picker: Math.round(r1.width), number: Math.round(r2.width), h1: Math.round(r1.height), h2: Math.round(r2.height), top: Math.round(r1.top - r2.top) }; }));
    console.log(label, w, JSON.stringify(m), 'scrollWidth=' + await page.evaluate(() => document.documentElement.scrollWidth));
    const el = await page.$('#custPhone');
    if (el && w === 375) { const g = await el.evaluateHandle((e) => e.closest('.grid') || e.parentElement.parentElement); await g.evaluate((e) => e.scrollIntoView({ block: 'center' })); await new Promise((r) => setTimeout(r, 400)); await g.screenshot({ path: `/workspace/next-shots/polish/${label}-phone-field-375.png` }); }
    await page.close();
  }
  await b.close();
})();
