// Record payment end-to-end (Supabase + billing Worker mocked by p2lib; nothing real is called).
// Partial payment, overpayment blocked, undo with confirmation, full clearance, receipt image/PDF markup,
// the edit lock, legacy receipts, the Owing filter + Balance column, Sales "Still owing", and the synced payload.
// Usage: node tests/p6payments.js [base]   (default http://localhost:3000 serving web/out)
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { SEED, d, setup, seed, watchErrors, sleep, SUPA } = require('./p2lib');
const base = process.argv[2] || 'http://localhost:3000';
const out = process.env.OUT || '/workspace/next-shots/payments';
fs.mkdirSync(out + '/dl', { recursive: true });
const results = []; const check = (n, ok, x) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (x !== undefined && !ok ? '  ' + JSON.stringify(x) : '')); };
const fmt = (n) => '₦' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function idbGet(page, id) {
  return page.evaluate((id) => new Promise((res) => { const r = indexedDB.open('receiptly_db'); r.onsuccess = () => { const q = r.result.transaction('receipts', 'readonly').objectStore('receipts').get(id); q.onsuccess = () => res(q.result); }; }), id);
}
const setVal = (page, sel, v) => page.evaluate((sel, v) => { const el = document.querySelector(sel); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, sel, v);
const clickText = (page, text, scope = 'button') => page.evaluate((text, scope) => { const b = Array.from(document.querySelectorAll(scope)).reverse().find((x) => x.textContent.trim() === text && x.offsetParent !== null); if (b) { b.click(); return true; } return false; }, text, scope);
const bodyText = (page) => page.evaluate(() => document.body.innerText);

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  for (const w of [375, 1280]) {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.setViewport({ width: w, height: w === 375 ? 812 : 900, isMobile: w === 375, hasTouch: w === 375 });
    const calls = []; await setup(page, { signedIn: true, calls }); const errs = watchErrors(page);
    page.on('dialog', (dlg) => dlg.accept().catch(() => {}));
    const pushed = []; page.on('request', (req) => { if (req.url().startsWith(SUPA + '/rest/v1/receipts') && req.method() === 'POST') { try { pushed.push(JSON.parse(req.postData() || 'null')); } catch (e) {} } });
    await page.evaluateOnNewDocument(() => {
      window.__captured = [];
      new MutationObserver(() => { document.querySelectorAll('body > div > .receipt').forEach((r) => { if (r.parentElement.style.left === '-10000px' && r.innerHTML) window.__captured.push(r.innerHTML); }); }).observe(document, { childList: true, subtree: true });
    });
    const dlDir = out + '/dl/' + w; fs.rmSync(dlDir, { recursive: true, force: true }); fs.mkdirSync(dlDir, { recursive: true });
    const cdp = await page.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir, browserContextId: ctx.id });
    await seed(page, base);
    const tag = ' @' + w;

    // Records list: Owing filter + balances
    await page.goto(base + '/records', { waitUntil: 'networkidle0' }); await sleep(1500);
    const listNums = () => page.evaluate((w) => w < 768
      ? Array.from(document.querySelectorAll('ul[aria-label="Receipts"] li')).map((li) => (li.textContent.match(/RCT-\d{6}/) || [''])[0])
      : Array.from(document.querySelectorAll('table tbody tr')).map((tr) => (tr.textContent.match(/RCT-\d{6}/) || [''])[0]), w);
    await clickText(page, 'Owing'); await sleep(600);
    const owing = (await listNums()).sort();
    const expOwing = SEED.filter((r) => !r.isDraft && !r.voided && !r.refunded && r.grand - r.paid > 0).map((r) => r.number).sort();
    check('Owing filter lists only receipts with a balance' + tag, JSON.stringify(owing) === JSON.stringify(expOwing), owing);
    await clickText(page, 'All'); await sleep(500);
    if (w >= 768) {
      const bal = await page.evaluate(() => Array.from(document.querySelectorAll('table tbody tr')).filter((tr) => tr.textContent.includes('RCT-000005')).map((tr) => tr.children[4].textContent)[0]);
      check('Balance column shows the outstanding amount' + tag, bal === fmt(12000), bal);
    } else {
      const tagTxt = await page.evaluate(() => { const li = Array.from(document.querySelectorAll('ul[aria-label="Receipts"] li')).find((l) => l.textContent.includes('RCT-000005')); return li && li.textContent; });
      check('Phone list shows "Owes" amount' + tag, tagTxt && tagTxt.includes('Owes ' + fmt(12000)), tagTxt);
    }

    // Legacy paid receipt: no panel, no history markup
    await page.goto(base + '/records?view=seed-1', { waitUntil: 'networkidle0' }); await sleep(1200);
    check('Legacy paid receipt: no payment panel and no history section' + tag, await page.evaluate(() => !document.getElementById('paymentPanel') && !document.querySelector('#viewPreview .r-payments') && !!document.querySelector('#viewPreview .r-status')));

    // Outstanding receipt
    await page.goto(base + '/records?view=seed-5', { waitUntil: 'networkidle0' }); await sleep(1500);
    check('Outstanding receipt shows balance + Record payment' + tag, await page.evaluate(() => !!document.getElementById('recordPaymentBtn') && document.getElementById('payPanelBalance').textContent), fmt(12000));
    await page.screenshot({ path: out + '/1-outstanding-receipt-' + w + '.png' });

    // Record payment sheet
    await page.click('#recordPaymentBtn'); await sleep(700);
    await page.screenshot({ path: out + '/2-record-payment-sheet-' + w + '.png' });
    const before = await idbGet(page, 'seed-5');
    await setVal(page, '#payAmount', '20000'); await sleep(200);
    await page.click('#savePaymentBtn'); await sleep(500);
    const after1 = await idbGet(page, 'seed-5');
    check('Overpayment blocked (₦20,000 on a ₦12,000 balance)' + tag, /more than the balance/.test(await bodyText(page)) && JSON.stringify(after1) === JSON.stringify(before));
    await setVal(page, '#payAmount', '0'); await page.click('#savePaymentBtn'); await sleep(300);
    check('Zero amount blocked' + tag, /greater than 0/.test(await bodyText(page)));
    await setVal(page, '#payAmount', '5000'); await setVal(page, '#payMethod', 'Bank Transfer'); await setVal(page, '#payNote', 'Second instalment');
    await sleep(200);
    check('Sheet previews the new balance' + tag, (await page.$eval('#sheetAfter', (e) => e.textContent)) === fmt(7000));
    await page.click('#savePaymentBtn'); await sleep(1500);
    const r1 = await idbGet(page, 'seed-5');
    check('Partial payment saved: paid 25,000 / balance 7,000 / PARTIALLY PAID' + tag, r1.paid === 25000 && r1.balance === 7000 && r1.status === 'PARTIALLY PAID' && r1.payments.length === 1 && r1.paidAtIssue === 20000, { paid: r1.paid, balance: r1.balance, status: r1.status });
    check('Payment entry has method, note and today\'s date' + tag, r1.payments[0].method === 'Bank Transfer' && r1.payments[0].note === 'Second instalment' && r1.payments[0].date === d(0));
    check('Preview panel updated to ₦7,000 + history list' + tag, (await page.$eval('#payPanelBalance', (e) => e.textContent)) === fmt(7000) && (await page.$$('#paymentList li')).length === 2);
    check('Receipt paper shows Payment history, Total paid, Balance remaining' + tag, await page.evaluate(() => { const t = document.querySelector('#viewPreview .r-payments'); return !!t && /Payment history/i.test(t.textContent) && t.textContent.includes('Second instalment') && t.textContent.includes('Balance remaining') && t.textContent.includes('₦7,000.00'); }));
    await page.screenshot({ path: out + '/3-after-partial-payment-' + w + '.png' });

    // Second payment, then undo it with confirmation
    await page.click('#recordPaymentBtn'); await sleep(600);
    await setVal(page, '#payAmount', '2000'); await page.click('#savePaymentBtn'); await sleep(1200);
    const r2 = await idbGet(page, 'seed-5');
    check('Multiple payments: two entries, balance ₦5,000' + tag, r2.payments.length === 2 && r2.balance === 5000);
    await page.click('#undoPaymentBtn'); await sleep(600);
    check('Undo asks for confirmation' + tag, /Undo last payment\?/.test(await bodyText(page)));
    await clickText(page, 'Cancel'); await sleep(500);
    check('Cancelling undo changes nothing' + tag, (await idbGet(page, 'seed-5')).payments.length === 2);
    await page.click('#undoPaymentBtn'); await sleep(600);
    await clickText(page, 'Undo payment'); await sleep(1200);
    const r3 = await idbGet(page, 'seed-5');
    check('Undo removes only the last payment (balance back to ₦7,000)' + tag, r3.payments.length === 1 && r3.balance === 7000 && r3.undonePayments.length === 1 && r3.undonePayments[0].amount === 2000);
    check('Undo is noted in the receipt history' + tag, r3.versions.some((v) => /payment undone/.test(v.action)));

    // Clear the balance
    await page.click('#recordPaymentBtn'); await sleep(600);
    await page.click('#payFull'); await sleep(200);
    await page.click('#savePaymentBtn'); await sleep(1500);
    const r4 = await idbGet(page, 'seed-5');
    check('Full clearance: PAID IN FULL, balance 0, cleared date' + tag, r4.status === 'PAID IN FULL' && r4.balance === 0 && r4.paid === 32000 && r4.paidInFullOn === d(0));
    check('Paid in full: Record payment hidden, receipt says PAID IN FULL + date' + tag, await page.evaluate(() => !document.getElementById('recordPaymentBtn') && document.querySelector('#viewPreview').textContent.includes('PAID IN FULL') && document.querySelector('#viewPreview').textContent.includes('Paid in full on')));
    await page.screenshot({ path: out + '/4-paid-in-full-' + w + '.png' });

    // Download image + PDF from the preview (same markup as the paper)
    await page.evaluate(() => { window.__captured = []; });
    await clickText(page, 'Image'); await sleep(4500);
    const cap = await page.evaluate(() => window.__captured.slice(-1)[0] || '');
    check('Downloaded image is rendered from markup with the payment history' + tag, /Payment history/.test(cap) && cap.includes('Balance remaining') && cap.includes('Second instalment'));
    await clickText(page, 'PDF'); await sleep(5000);
    const dl = fs.readdirSync(dlDir);
    check('PNG + PDF downloaded' + tag, dl.some((f) => f.endsWith('.png')) && dl.some((f) => f.endsWith('.pdf')), dl);
    const png = dl.find((f) => f.endsWith('.png')); if (png) fs.copyFileSync(dlDir + '/' + png, out + '/5-downloaded-receipt-image-' + w + '.png');

    // Sync payload: the history rides inside the existing payload column; summary columns updated
    const last = pushed.filter((b) => b && (Array.isArray(b) ? b[0] : b).id === 'seed-5').map((b) => (Array.isArray(b) ? b[0] : b)).slice(-1)[0];
    check('Synced row carries payments in payload + updated amount_paid/outstanding/status' + tag, !!last && last.payload && last.payload.payments.length === 2 && last.amount_paid === 32000 && last.outstanding === 0 && last.payment_status === 'PAID IN FULL', last && { amount_paid: last.amount_paid, outstanding: last.outstanding, status: last.payment_status });
    check('Synced row has no new columns (same keys as before)' + tag, !!last && Object.keys(last).sort().join() === ['id', 'user_id', 'receipt_number', 'customer_name', 'customer_phone', 'customer_email', 'subtotal', 'discount', 'tax', 'tax_pct', 'total', 'amount_paid', 'outstanding', 'payment_status', 'payment_method', 'currency', 'template_id', 'receipt_date', 'receipt_time', 'notes', 'payload', 'created_at', 'updated_at', 'deleted_at'].sort().join());

    // Records list with balances (after payments on #5)
    await page.goto(base + '/records', { waitUntil: 'networkidle0' }); await sleep(1500);
    if (w < 768) { await page.evaluate(() => { const l = document.querySelector('ul[aria-label="Receipts"]'); window.scrollTo(0, l.getBoundingClientRect().top + window.scrollY - 70); }); await sleep(400); }
    await page.screenshot({ path: out + '/6-records-list-balances-' + w + '.png', fullPage: w === 1280 });
    const fits = await page.evaluate(() => { const t = document.querySelector('table'); return !t || t.offsetParent === null || t.scrollWidth <= t.parentElement.clientWidth + 1; });
    if (w === 1280) check('Records table fits without sideways scrolling' + tag, fits);
    check('No page-level horizontal overflow on Records' + tag, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));

    // Edit lock: receipt with payments
    await page.goto(base + '/new?edit=seed-5', { waitUntil: 'networkidle0' }); await sleep(1800);
    const lock5 = await page.evaluate(() => ({
      status: Array.from(document.querySelectorAll('input[name="paymentStatus"]')).every((i) => i.matches(':disabled')),
      paid: document.getElementById('amountPaid').readOnly,
      note: !!document.getElementById('payLockNote'), amountsNote: !!document.getElementById('amountsLockNote'),
      itemsDisabled: Array.from(document.querySelectorAll('[id^="item-price-"]')).every((i) => i.matches(':disabled')),
    }));
    check('Edit (has payments): status + amount paid + items locked, guidance shown' + tag, lock5.status && lock5.paid && lock5.note && lock5.amountsNote && lock5.itemsDisabled, lock5);
    await page.evaluate(() => document.getElementById('payLockNote').scrollIntoView({ block: 'center' })); await sleep(600);
    await page.screenshot({ path: out + '/7-edit-locked-' + w + '.png' });
    await setVal(page, '#notes', 'Edited note only');
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => (x.textContent.trim() === 'Save receipt' || x.textContent.trim() === 'Save') && x.offsetParent !== null); b && b.click(); }); await sleep(2500);
    const e5 = await idbGet(page, 'seed-5');
    check('Saving an edit keeps the payment history and figures' + tag, e5.notes === 'Edited note only' && e5.payments.length === 2 && e5.paid === 32000 && e5.status === 'PAID IN FULL' && e5.grand === 32000);
    await page.keyboard.press('Escape'); await sleep(300);
    await page.goto('about:blank', { waitUntil: 'domcontentloaded' }).catch(() => {});

    // Edit lock: owing receipt without payments (legacy partially paid #2) — items editable, status/paid locked
    await page.goto(base + '/new?edit=seed-2', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    const lock2 = await page.evaluate(() => ({
      status: Array.from(document.querySelectorAll('input[name="paymentStatus"]')).every((i) => i.matches(':disabled')),
      paid: document.getElementById('amountPaid').readOnly, amountsNote: !!document.getElementById('amountsLockNote'),
      itemsEnabled: Array.from(document.querySelectorAll('[id^="item-price-"]')).every((i) => !i.matches(':disabled')),
    }));
    check('Edit (owing, no payments yet): status/paid locked, items still editable' + tag, lock2.status && lock2.paid && !lock2.amountsNote && lock2.itemsEnabled, lock2);

    // Legacy paid receipt: editor unchanged
    await page.goto(base + '/new?edit=seed-1', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    check('Edit (paid legacy receipt): status chips still editable as before' + tag, await page.evaluate(() => Array.from(document.querySelectorAll('input[name="paymentStatus"]')).every((i) => !i.matches(':disabled')) && !document.getElementById('payLockNote')));

    // Sales: Still owing filter
    await page.goto(base + '/sales', { waitUntil: 'domcontentloaded' }); await sleep(3000);
    const hasOpt = await page.evaluate(() => !!document.querySelector('#salesPayStatus option[value="owing"]'));
    if (hasOpt) { await setVal(page, '#salesPayStatus', 'owing'); await sleep(600); }
    const prodTxt = await page.evaluate(() => document.body.innerText);
    check('Sales has a "Still owing" product filter' + tag, hasOpt && /Total outstanding/.test(prodTxt));

    check('No page errors' + tag, errs.length === 0, errs.slice(0, 3));
    check('Checkout never called' + tag, !calls.includes('CHECKOUT!'));
    await ctx.close();
  }
  await browser.close();
  const f = results.filter((r) => !r.ok).length;
  console.log('\n' + (results.length - f) + ' passed, ' + f + ' failed');
  process.exit(f ? 1 : 0);
})();
