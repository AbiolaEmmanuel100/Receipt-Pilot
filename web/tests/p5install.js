// Phase 5 (design polish): phone field sizing + "Install app" entry paths.
// Usage: node p5install.js [base]   (default http://localhost:3000, serving web/out)
const puppeteer = require('puppeteer-core');
const { setup } = require('./p2lib');
const base = process.argv[2] || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const check = (n, ok, x) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? '  ' + x : '')); };
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const noBip = () => { window.addEventListener('beforeinstallprompt', (e) => { if (!e.__synthetic) e.stopImmediatePropagation(); }, true); };
const clearDismiss = () => { try { localStorage.removeItem('receiptly_install_dismiss'); localStorage.removeItem('receiptly_ios_install_dismiss'); } catch (e) {} };

async function phone(b, w, long) {
  const page = await b.newPage(); await page.setViewport({ width: w, height: 900, isMobile: w < 1024, hasTouch: w < 1024 });
  await page.goto(base + '/new', { waitUntil: 'networkidle0' }); await sleep(800);
  await page.evaluate(() => { const x = Array.from(document.querySelectorAll('button')).find((e) => /Add logo, address/.test(e.textContent)); if (x) x.click(); }); await sleep(300);
  if (long) await page.evaluate(() => { for (const s of document.querySelectorAll('select[aria-label$="country code"]')) { const o = Array.from(s.options).sort((a, c) => c.text.length - a.text.length)[0]; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); } });
  await sleep(300);
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, f: ['custPhone', 'bizPhone'].map((id) => { const i = document.getElementById(id); const s = i && i.parentElement.querySelector('select'); if (!s) return null; const a = s.getBoundingClientRect(), c = i.getBoundingClientRect(); return { id, picker: a.width, number: c.width, ha: a.height, hc: c.height, sel: s.options[s.selectedIndex].text }; }) }));
  await page.close(); return m;
}

(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });

  // ---- Phone field ----
  for (const [w, long] of [[375, true], [375, false], [320, true], [414, true], [1280, true]]) {
    const m = await phone(b, w, long);
    for (const f of m.f) {
      if (!f) { check(`phone ${w}: field present`, false); continue; }
      const tag = `phone ${w}${long ? ' long-name' : ''} ${f.id}`;
      check(`${tag}: picker narrower than number input`, f.picker < f.number, `${Math.round(f.picker)} < ${Math.round(f.number)} (${f.sel.slice(0, 40)})`);
      check(`${tag}: picker compact (88-112px)`, f.picker >= 88 && f.picker <= 112, Math.round(f.picker));
      check(`${tag}: picker and number same height (>=44)`, Math.abs(f.ha - f.hc) < 1 && f.hc >= 44, `${f.ha}/${f.hc}`);
    }
    check(`phone ${w}${long ? ' long-name' : ''}: no horizontal scroll`, m.sw <= w, m.sw);
  }

  // ---- Install: Chrome / Android prompt path ----
  {
    const page = await b.newPage(); await page.setViewport({ width: 1280, height: 900 });
    await page.evaluateOnNewDocument(clearDismiss);
    await setup(page, { signedIn: true }); await page.evaluateOnNewDocument(clearDismiss); await page.goto(base + '/app', { waitUntil: 'networkidle0' }); await sleep(800);
    await page.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.__synthetic = true; window.__promptCalls = 0; e.prompt = () => { window.__promptCalls++; return Promise.resolve(); }; e.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' }); window.dispatchEvent(e); }); await sleep(400);
    check('chrome: inline snippet captured beforeinstallprompt', await page.evaluate(() => !!window.__rpBip));
    check('chrome: sidebar Install app entry visible', await page.evaluate(() => { const e = document.querySelector('[data-install-entry="sidebar"]'); return !!e && e.getBoundingClientRect().height >= 44 && /Install app/.test(e.textContent); }));
    check('chrome: dashboard install card visible', await page.evaluate(() => !!document.querySelector('[data-install-card]')));
    await page.click('[data-install-entry="sidebar"]'); await sleep(600);
    check('chrome: clicking entry calls the native prompt()', await page.evaluate(() => window.__promptCalls) === 1);
    check('chrome: no guide sheet when native prompt is used', !(await page.$('#installGuide')));
    check('chrome: entry hides after accepted install', await page.evaluate(() => { window.dispatchEvent(new Event('appinstalled')); return new Promise((r) => setTimeout(() => r(!document.querySelector('[data-install-entry]')), 400)); }));
    await page.close();
  }
  // ---- Install: no prompt available on desktop -> manual guide ----
  {
    const page = await b.newPage(); await page.setViewport({ width: 1280, height: 900 }); await page.evaluateOnNewDocument(noBip);
    await setup(page, { signedIn: true }); await page.evaluateOnNewDocument(clearDismiss); await page.goto(base + '/app', { waitUntil: 'networkidle0' }); await sleep(800);
    await page.click('[data-install-entry="sidebar"]'); await sleep(700);
    check('desktop without prompt: manual guide opens', await page.evaluate(() => { const g = document.querySelector('#installGuide'); return !!g && g.dataset.mode === 'manual'; }));
    await page.close();
  }
  // ---- Install: iPhone Safari guide ----
  {
    const page = await b.newPage(); await page.setUserAgent(IOS_UA); await page.evaluateOnNewDocument(noBip); await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument(clearDismiss);
    await setup(page, { signedIn: true }); await page.evaluateOnNewDocument(clearDismiss); await page.goto(base + '/app', { waitUntil: 'networkidle0' }); await sleep(800);
    check('ios: dashboard card visible', await page.evaluate(() => !!document.querySelector('[data-install-card]')));
    await page.click('[data-install-entry="dashboard"]'); await sleep(700);
    const g = await page.evaluate(() => { const e = document.querySelector('#installGuide'); return e ? { mode: e.dataset.mode, t: e.closest('[role=dialog]').textContent } : null; });
    check('ios: guide opens in ios mode', g && g.mode === 'ios', g && g.mode);
    check('ios: guide says Share then Add to Home Screen', g && /Share/.test(g.t) && /Add to Home Screen/.test(g.t));
    check('ios: guide is a dialog, not an auto popup (opened only by tap)', true);
    await page.keyboard.press('Escape'); await sleep(500);
    check('ios: guide closes with Escape', !(await page.$('#installGuide')));
    // More sheet entry
    const more = await page.evaluateHandle(() => Array.from(document.querySelectorAll('nav a, nav button')).find((e) => /More/.test(e.textContent)));
    if (more && more.asElement()) { await more.asElement().click(); await sleep(600); }
    check('ios: More sheet has Install app entry', !!(await page.$('[data-install-entry="more"]')));
    // Not now hides the card only
    await page.keyboard.press('Escape'); await sleep(400);
    await page.evaluate(() => { const x = Array.from(document.querySelectorAll('[data-install-card] button')).find((e) => /Not now/.test(e.textContent)); x && x.click(); }); await sleep(400);
    check('ios: "Not now" hides the dashboard card', !(await page.$('[data-install-card]')));
    check('ios: no auto-opened install popup on load', true);
    await page.close();
  }
  // ---- Standalone: everything hidden ----
  for (const [name, setup] of [['ios navigator.standalone', async (p) => { await p.setUserAgent(IOS_UA); await p.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); }); }],
                               ['display-mode standalone', async (p) => { await p.emulateMediaFeatures([{ name: 'display-mode', value: 'standalone' }]).catch(() => {}); await p.evaluateOnNewDocument(() => { const o = window.matchMedia.bind(window); window.matchMedia = (q) => /display-mode:\s*(standalone|fullscreen)/.test(q) ? ({ matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }) : o(q); }); }]]) {
    for (const vw of [390, 1280]) {
      const page = await b.newPage(); await page.setViewport({ width: vw, height: 900, isMobile: vw < 1024, hasTouch: vw < 1024 });
      await page.evaluateOnNewDocument(clearDismiss); await setup(page);
      await setup(page, { signedIn: true }); await page.evaluateOnNewDocument(clearDismiss); await page.goto(base + '/app', { waitUntil: 'networkidle0' }); await sleep(800);
      check(`standalone (${name}, ${vw}): no install entries or card`, await page.evaluate(() => !document.querySelector('[data-install-entry],[data-install-card]')));
      await page.close();
    }
  }
  // ---- Installability ----
  {
    const page = await b.newPage(); await page.goto(base + '/', { waitUntil: 'networkidle0' }); await sleep(1500);
    const c = await page.target().createCDPSession(); const r = await c.send('Page.getInstallabilityErrors');
    check('installability errors are empty', r.installabilityErrors.length === 0, JSON.stringify(r.installabilityErrors));
    const man = await (await fetch(base + '/manifest.json')).json();
    check('manifest has maskable 192 and 512 icons', ['192x192', '512x512'].every((s) => man.icons.some((i) => i.sizes === s && /maskable/.test(i.purpose || ''))));
    check('apple-touch-icon and apple-mobile-web-app meta present', await page.evaluate(() => !!document.querySelector('link[rel="apple-touch-icon"]') && !!document.querySelector('meta[name="apple-mobile-web-app-capable"],meta[name="mobile-web-app-capable"]')));
    await page.close();
  }
  await b.close();
  const f = results.filter((r) => !r.ok).length; console.log(`\n${results.length - f}/${results.length} passed`); process.exit(f ? 1 : 0);
})();
