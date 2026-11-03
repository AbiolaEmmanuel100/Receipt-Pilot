// Service-worker hand-over: a browser that has the OLD site's SW (receiptly-v34) installed visits
// the same origin after the switch to the Next build. Expect: fresh new pages, old caches deleted.
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const check = (n, ok, x) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? '  ' + x : '')); };
const CUR = (require('fs').readFileSync('/workspace/rp-site/web/public/sw.js', 'utf8').match(/const CACHE = "([^"]+)"/) || [])[1];
const PORT = 3005, base = 'http://localhost:' + PORT;
function serve(dir) { const p = spawn(process.execPath, ['/workspace/tools/cfserve.mjs', dir, String(PORT)], { stdio: 'ignore' }); return p; }
(async () => {
  const profile = fs.mkdtempSync('/tmp/swprof-');
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', userDataDir: profile, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('receiptly_install_dismiss', '1'); } catch (e) {} });
  const caches = () => page.evaluate(() => caches.keys());
  const ctrl = () => page.evaluate(() => navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null);

  let srv = serve('/workspace/rp-site'); await sleep(1200);
  await page.goto(base + '/index.html', { waitUntil: 'networkidle0' }); await sleep(4000);
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(1500);
  check('old site: old SW controls the page', /\/sw\.js$/.test(await ctrl() || ''), await ctrl());
  check('old site: receiptly-v34 cache present', (await caches()).includes('receiptly-v34'), JSON.stringify(await caches()));
  srv.kill(); await sleep(800);

  srv = serve('/workspace/rp-site/web/out'); await sleep(1200);
  await page.goto(base + '/', { waitUntil: 'networkidle0' }); await sleep(1000);
  const first = await page.evaluate(() => !!document.querySelector('script[src*="/_next/"]'));
  check('after switch, first visit already gets the NEW page (old SW is network-first)', first);
  await sleep(5000);
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(2000);
  const keys = await caches();
  check('new SW took over and old receiptly-* caches were deleted', keys.length >= 1 && keys.every((k) => k === CUR), JSON.stringify(keys));
  const swSrc = await page.evaluate(() => fetch('/sw.js').then((r) => r.text()));
  check('controller is the new /sw.js (current cache)', /\/sw\.js$/.test(await ctrl() || '') && swSrc.includes(CUR), await ctrl());
  // Offline: navigation is served from the new cache, never an old-site page
  await page.goto(base + '/records', { waitUntil: 'networkidle0' }); await sleep(1500);
  srv.kill(); await sleep(800);
  await page.setOfflineMode(true);
  await page.goto(base + '/records', { waitUntil: 'domcontentloaded' }).catch(() => {}); await sleep(1500);
  const off = await page.evaluate(() => ({ next: !!document.querySelector('script[src*="/_next/"]'), legacy: !!document.querySelector('script[src*="js/app.js"],script[src*="js/records.js"]') }));
  check('offline after switch: new page from cache, no old-site page', off.next && !off.legacy, JSON.stringify(off));
  await page.setOfflineMode(false);
  // Rollback: old site served again on the same origin
  srv = serve('/workspace/rp-site'); await sleep(1200);
  await page.goto(base + '/', { waitUntil: 'networkidle0' }); await sleep(1000);
  check('rollback: first visit gets the OLD page again (new SW is network-first for pages)', await page.evaluate(() => !!document.querySelector('script[src*="js/app.js"]')));
  await sleep(5000); await page.reload({ waitUntil: 'networkidle0' }); await sleep(2000);
  const rk = await caches();
  check('rollback: old SW back in charge, only receiptly-v34 cache left', rk.length >= 1 && rk.every((k) => k === 'receiptly-v34'), JSON.stringify(rk));
  srv.kill();
  await browser.close(); fs.rmSync(profile, { recursive: true, force: true });
  console.log(results.filter((r) => r.ok).length + '/' + results.length + ' passed');
})();
