// Before/after screenshots for the design polish: home, /app, /new, /records (375 + 1280) and the install guide.
const puppeteer = require('puppeteer-core');
const { KnownDevices } = puppeteer;
const { setup, seed, sleep, UID } = require('./p2lib');
const label = process.argv[2] || 'after';
const base = process.argv[3] || 'http://localhost:3000';
const out = '/workspace/next-shots/polish';
const lagos = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  for (const w of [375, 1280]) {
    for (const [name, path, signedIn] of [['home', '/', false], ['app', '/app', true], ['new', '/new', true], ['records', '/records', true]]) {
      const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
      await page.setViewport({ width: w, height: w === 375 ? 812 : 900, isMobile: w === 375, hasTouch: w === 375, deviceScaleFactor: w === 375 ? 2 : 1 });
      await setup(page, { signedIn });
      await page.evaluateOnNewDocument((k, v) => { try { localStorage.setItem(k, v); localStorage.setItem('receiptly_install_dismiss', '1'); localStorage.setItem('receiptly_ios_install_dismiss', '1'); } catch (e) {} }, 'rp_plan_notice_' + UID, lagos());
      if (signedIn) await seed(page, base);
      await page.goto(base + path, { waitUntil: 'networkidle0' }); await sleep(3500);
      await page.screenshot({ path: `${out}/${label}-${name}-${w}.png` });
      await ctx.close();
    }
  }
  // Install guide: iPhone Safari (375) and desktop Chrome with an install prompt available (1280)
  {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.emulate(KnownDevices['iPhone 13']); await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await setup(page, { signedIn: true });
    await page.evaluateOnNewDocument((k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, 'rp_plan_notice_' + UID, lagos());
    await page.evaluateOnNewDocument(() => { window.addEventListener('beforeinstallprompt', (e) => { if (!e.__synthetic) e.stopImmediatePropagation(); }, true); try { localStorage.removeItem('receiptly_install_dismiss'); localStorage.removeItem('receiptly_ios_install_dismiss'); } catch (e) {} });
    await seed(page, base);
    await page.goto(base + '/app', { waitUntil: 'networkidle0' }); await sleep(2500);
    await page.evaluate(() => { const c = document.querySelector('[data-install-card]'); if (c) c.scrollIntoView({ block: 'center' }); }); await sleep(500);
    await page.screenshot({ path: `${out}/${label}-install-card-375.png` });
    const opened = await page.evaluate(() => { const b = document.querySelector('[data-install-entry=dashboard]') || document.querySelector('[data-install-entry]'); if (b) { b.click(); return true; } return false; });
    await sleep(900);
    await page.screenshot({ path: `${out}/${label}-install-guide-375.png` });
    console.log('ios install entry clicked:', opened);
    await ctx.close();
  }
  {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await setup(page, { signedIn: true });
    await page.evaluateOnNewDocument((k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, 'rp_plan_notice_' + UID, lagos());
    await page.evaluateOnNewDocument(() => { window.addEventListener('load', () => setTimeout(() => { const e = new Event('beforeinstallprompt'); e.__synthetic = true; e.prompt = () => Promise.resolve(); e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); }, 300)); });
    await seed(page, base);
    await page.goto(base + '/app', { waitUntil: 'networkidle0' }); await sleep(2500);
    await page.screenshot({ path: `${out}/${label}-install-entry-1280.png` });
    // desktop browser without a prompt (e.g. Safari/Firefox): the guide
    const c2 = await browser.createBrowserContext(); const p2 = await c2.newPage(); await p2.setViewport({ width: 1280, height: 900 });
    await setup(p2, { signedIn: true }); await p2.evaluateOnNewDocument((k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, 'rp_plan_notice_' + UID, lagos());
    await p2.evaluateOnNewDocument(() => { window.addEventListener('beforeinstallprompt', (e) => { if (!e.__synthetic) e.stopImmediatePropagation(); }, true); });
    await seed(p2, base); await p2.goto(base + '/app', { waitUntil: 'networkidle0' }); await sleep(2500);
    await p2.evaluate(() => { const b = document.querySelector('[data-install-entry=sidebar]'); if (b) b.click(); }); await sleep(900);
    await p2.screenshot({ path: `${out}/${label}-install-guide-1280.png` }); await c2.close();
    await ctx.close();
  }
  await browser.close();
  console.log('done', label);
})();
