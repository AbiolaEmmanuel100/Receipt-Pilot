// Layout/a11y audit: horizontal overflow, tap targets <44px, unlabeled controls, broken images,
// failed requests and console errors, per page and width.
// BASE=http://localhost:3000 (stubbed session for signed-in pages) | BASE=https://receipt-pilot.com LIVE=1 (public pages only, read-only GETs)
const puppeteer = require('puppeteer-core');
const { setup, seed, sleep, UID } = require('./p2lib');
const base = process.env.BASE || 'http://localhost:3000', LIVE = !!process.env.LIVE;
const WIDTHS = (process.env.WIDTHS || '320,375,414,768,1280').split(',').map(Number);
const all = [['/', 0], ['/app', 1], ['/new', 1], ['/records', 1], ['/sales', 1], ['/customers', 1], ['/billing', 1], ['/notifications', 1], ['/admin', 1], ['/signin', 0], ['/about', 0], ['/privacy-policy', 0], ['/terms', 0], ['/nope', 0], ['/r?t=abcdefgh12', 0], ['/reset', 0]];
const pages = (process.env.ONLY ? process.env.ONLY.split(',').map((x) => [x, 1]) : all).filter(([, si]) => !(LIVE && si));
const shots = process.env.SHOTS; let bad = 0;
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  for (const w of WIDTHS) for (const [p, si] of pages) {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); const mob = w < 1024;
    await page.setViewport({ width: w, height: mob ? 812 : 900, isMobile: mob, hasTouch: mob });
    if (!LIVE) { await setup(page, { signedIn: !!si, adminRows: [] }); await page.evaluateOnNewDocument((k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, 'rp_plan_notice_' + UID, new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date())); if (si) await seed(page, base); }
    const errs = [], failed = [];
    page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 160)); });
    page.on('response', (r) => { const u = r.url(); if (r.status() >= 400 && !/\/nope$/.test(u) && !/supabase\.co\/auth/.test(u)) failed.push(r.status() + ' ' + u.slice(0, 100)); });
    await page.goto(base + p, { waitUntil: 'networkidle0' }); await sleep(1500);
    const r = await page.evaluate((vw) => {
      const vis = (e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && b.width > 0 && b.height > 0 && !e.closest('[aria-hidden=true],[inert]'); };
      const small = [];
      for (const e of document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],summary')) {
        if (!vis(e)) continue; const b = e.getBoundingClientRect();
        if (e.matches('input[type=checkbox],input[type=radio]')) { const l = e.closest('label'); const lb = l && l.getBoundingClientRect(); if (lb && lb.height >= 44) continue; }
        // inline text links inside a sentence are exempt (WCAG 2.5.8 inline exception)
        if (e.tagName === 'A' && getComputedStyle(e).display === 'inline' && e.parentElement && /P|LI|SPAN|SMALL/.test(e.parentElement.tagName) && e.parentElement.textContent.trim().length > e.textContent.trim().length + 10) continue;
        if ((b.width <= 2 && b.height <= 2) || e.closest('.sr-only')) continue; // sr-only skip link (visible on focus)
        if (b.height < 43.5 || b.width < 43.5) small.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}"${(e.getAttribute('aria-label') || e.textContent || e.name || '').trim().slice(0, 28)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
      }
      const unlabeled = Array.from(document.querySelectorAll('input:not([type=hidden]),select,textarea')).filter((e) => vis(e) && !e.labels?.length && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')).map((e) => e.id || e.name || e.type);
      const imgs = Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src.slice(0, 80));
      const wide = vw < document.documentElement.scrollWidth ? Array.from(document.querySelectorAll('body *')).filter((e) => e.getBoundingClientRect().right > vw + 1 && vis(e) && !e.closest('[class*=overflow-x],[class*=overflow-auto]')).slice(0, 4).map((e) => e.tagName + '.' + String(e.className).slice(0, 50)) : [];
      return { sw: document.documentElement.scrollWidth, small, unlabeled, imgs, wide, url: location.pathname + location.search };
    }, w);
    if (shots) await page.screenshot({ path: `${shots}/${(p.replace(/[/?=]/g, '_') || 'home')}-${w}.png`, fullPage: mob });
    const issues = [];
    if (r.sw > w) issues.push('OVERFLOW ' + r.sw + ' ' + JSON.stringify(r.wide));
    if (r.small.length) issues.push('SMALL ' + JSON.stringify(r.small.slice(0, 8)) + (r.small.length > 8 ? ` +${r.small.length - 8}` : ''));
    if (r.unlabeled.length) issues.push('UNLABELED ' + JSON.stringify(r.unlabeled));
    if (r.imgs.length) issues.push('BROKEN_IMG ' + JSON.stringify(r.imgs));
    if (failed.length) issues.push('HTTP ' + JSON.stringify(failed.slice(0, 5)));
    if (errs.length) issues.push('CONSOLE ' + JSON.stringify(errs.slice(0, 3)));
    if (issues.length) bad++;
    console.log(`${w} ${p} -> ${r.url}  ${issues.length ? issues.join(' | ') : 'ok'}`);
    await ctx.close();
  }
  await browser.close(); console.log(`\n${bad} page/width combos with findings`);
})();
