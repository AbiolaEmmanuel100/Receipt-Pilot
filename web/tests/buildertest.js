// Receipt builder end-to-end as a guest (first session): fill, save, see in Receipts, PDF + PNG download, share link + QR.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const base = 'http://localhost:3000';
const out = '/workspace/next-shots/builder-tests'; fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out + '/dl', { recursive: true });
const lib = require('./p2lib');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const check = (n, ok, x) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out + '/dl' });
  await page.setViewport({ width: 1280, height: 900 });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  const opts = {}; await lib.setup(page, opts); // mocked Supabase/Worker; guest until we sign in below
  await page.evaluateOnNewDocument(() => { localStorage.setItem('receiptly_install_dismiss', '1'); });
  await page.goto(base + '/new', { waitUntil: 'networkidle0' }); await sleep(800);
  const clickText = (t, scope = 'button,a') => page.evaluate((t, scope) => { const el = [...document.querySelectorAll(scope)].filter((b) => b.offsetParent).find((b) => b.textContent.trim() === t); if (el) { el.click(); return true; } return false; }, t, scope);
  await page.type('input[placeholder="e.g. Mama Tobi Foods"]', 'Test Shop Ltd');
  await page.type('input[placeholder^="Item 1"]', 'Rice bag');
  const priceSel = 'input[placeholder="0.00"]';
  await page.click(priceSel); await page.type(priceSel, '25000');
  await clickText('Add item'); await sleep(200);
  const items = await page.$$('input[placeholder^="Item "]');
  await items[1].type('Delivery bag');
  const prices = await page.$$(priceSel); await prices[1].type('1500');
  await sleep(500);
  const preview = await page.evaluate(() => (document.querySelector('.receipt') || {}).innerText || '');
  check('live preview shows business + items', preview.includes('Test Shop Ltd') && preview.includes('Rice bag') && preview.includes('Delivery bag'));
  check('grand total computed (₦26,500.00)', preview.includes('₦26,500.00'), (preview.match(/Grand Total\s*\S+/) || [''])[0]);
  await page.screenshot({ path: out + '/filled-1280.png' });
  await clickText('Save receipt') || await clickText('Save');
  await sleep(1500);
  const t = await page.evaluate(() => document.body.innerText);
  check('saved dialog appears', /saved/i.test(t) && t.includes('Send to customer'), (t.match(/.*saved.*/i) || [''])[0]);
  await page.screenshot({ path: out + '/saved-1280.png' });
  const db = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('receiptly_db'); r.onsuccess = () => { const d = r.result; const names = [...d.objectStoreNames]; const tx = d.transaction(names, 'readonly'); const out = {}; let n = names.length; names.forEach((s) => { const q = tx.objectStore(s).getAll(); q.onsuccess = () => { out[s] = q.result; if (!--n) res(out); }; }); }; r.onerror = () => res(null); }));
  const recs = db && (db.receipts || Object.values(db).find((v) => Array.isArray(v) && v.some((x) => x && x.number)));
  const rec = recs && recs.find((x) => x.number);
  check('receipt stored in IndexedDB receiptly_db', !!rec, rec ? rec.number + ' grand=' + rec.grand + ' status=' + rec.status : JSON.stringify(Object.keys(db || {})));
  check('numbering RCT-000001', rec && rec.number === 'RCT-000001');
  // Download image from saved dialog
  await clickText('Download image'); await sleep(4000);
  // Phase 2: history is signed-in only — a guest is sent to sign-in with a return path
  await page.goto(base + '/records', { waitUntil: 'networkidle0' }); await sleep(1500);
  check('guest /records → /signin?next=%2Frecords', page.url() === base + '/signin?next=%2Frecords', page.url());
  // Sign in (mocked session) and continue with the same device's receipts
  opts.signedIn = true; await page.evaluate((s) => localStorage.setItem('receiptly-auth', JSON.stringify(s)), lib.session);
  await page.goto(base + '/records', { waitUntil: 'networkidle0' }); await sleep(1500);
  const asked = (await page.evaluate(() => document.body.innerText)).match(/.*sync.*/gi) || [];
  check('signed in: offered to sync the guest receipt', await clickText('Yes, sync them'), asked.slice(0, 2).join(' | '));
  await sleep(1500);
  const rt = await page.evaluate(() => document.body.innerText);
  check('receipt listed on /records', rt.includes('RCT-000001'));
  check('KPI total shows ₦26,500.00', rt.includes('₦26,500.00'));
  await page.screenshot({ path: out + '/records-1280.png' });
  await page.goto(base + '/records?view=' + encodeURIComponent(rec.id), { waitUntil: 'networkidle0' }); await sleep(1200);
  check('?view= opens preview modal', (await page.$$('[role=dialog]')).length > 0);
  await page.screenshot({ path: out + '/records-view-1280.png' });
  await page.goto(base + '/new', { waitUntil: 'networkidle0' }); await sleep(800);
  await clickText('PDF'); await sleep(5000);
  const dl = fs.readdirSync(out + '/dl');
  check('PNG downloaded', dl.some((f) => f.endsWith('.png')), dl.join(', '));
  check('PDF downloaded', dl.some((f) => f.endsWith('.pdf')), dl.join(', '));
  for (const f of dl) { const b = fs.readFileSync(out + '/dl/' + f); console.log('   ', f, b.length + ' bytes', b.slice(0, 5).toString('latin1').replace(/[^\x20-\x7e]/g, '.')); }
  // Share: ensures a token and renders QR on the receipt
  await page.goto(base + '/records', { waitUntil: 'networkidle0' }); await sleep(1000);
  await page.goto(base + '/records?view=' + encodeURIComponent(rec.id), { waitUntil: 'networkidle0' }); await sleep(800);
  const sent = await clickText('Send');
  await sleep(1500);
  const st = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: out + '/share-sheet-1280.png' });
  check('share sheet opens with WhatsApp + Copy link', sent && /WhatsApp/.test(st) && /Copy link/i.test(st));
  const tok = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('receiptly_db'); r.onsuccess = () => { const d = r.result; const tx = d.transaction(['receipts'], 'readonly'); const q = tx.objectStore('receipts').getAll(); q.onsuccess = () => res((q.result.find((x) => x.number === 'RCT-000001') || {}).shareToken || ''); }; }));
  check('share token created', tok && tok.length >= 8, tok);
  // Signed in: /r asks Supabase rpc get_shared_receipt (mocked here with the synced row)
  opts.shared = [await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('receiptly_db'); r.onsuccess = () => { const q = r.result.transaction(['receipts']).objectStore('receipts').getAll(); q.onsuccess = () => res(q.result.find((x) => x.number === 'RCT-000001')); }; }))];
  // r page resolves the token (falls back to this device's records)
  await page.goto(base + '/r?t=' + tok, { waitUntil: 'networkidle0' }); await sleep(2500);
  const rp = await page.evaluate(() => ({ text: document.body.innerText, qr: !!document.querySelector('.r-verify img[src^="data:image"]') }));
  check('/r shows "Receipt Verified ✓" for the token', rp.text.includes('Receipt Verified ✓') && rp.text.includes('RCT-000001'));
  check('verification QR rendered (data: URL, bundled qrcode lib)', rp.qr);
  await page.screenshot({ path: out + '/r-verified-1280.png', fullPage: true });
  check('no page errors', errs.length === 0, JSON.stringify(errs.slice(0, 5)));
  await browser.close();
  console.log(results.filter((r) => r.ok).length + '/' + results.length + ' passed');
})();
