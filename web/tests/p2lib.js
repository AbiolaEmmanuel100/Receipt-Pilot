// Shared helpers for Phase 2 browser tests: mocked Supabase + billing Worker, seeded IndexedDB.
const SUPA = 'https://xwmfkfcsyqgwtfjumubh.supabase.co';
const WORKER = 'https://receipt-pilot-billing.eabiolakayode.workers.dev';
const UID = '11111111-2222-3333-4444-555555555555';
const future = Math.floor(Date.now() / 1000) + 3600;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: UID, exp: future, role: 'authenticated', email: 'owner@example.com' }) + '.sig';
const user = { id: UID, email: 'owner@example.com', aud: 'authenticated', role: 'authenticated', email_confirmed_at: '2026-10-01T10:00:00Z', confirmed_at: '2026-10-01T10:00:00Z', last_sign_in_at: new Date().toISOString(), user_metadata: { business_name: 'Test Biz Ltd' }, app_metadata: {} };
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: future, refresh_token: 'r', user };
const TRIAL_END = new Date(Date.now() + 10 * 86400000).toISOString();

function pad(n) { return String(n).padStart(2, '0'); }
function d(off) { const x = new Date(); x.setDate(x.getDate() + off); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); }
const BIZ = { name: 'Test Biz Ltd', address: '12 Market Road, Ibadan', phone: '+234 800 000 0000' };
function rec(n, date, time, cust, items, o = {}) {
  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
  const discount = o.discount || 0, taxPct = o.taxPct || 0, shipping = o.shipping || 0;
  const tax = Math.round((subtotal - discount) * taxPct) / 100;
  const grand = subtotal - discount + tax + shipping;
  const paid = o.paid != null ? o.paid : grand;
  const balance = Math.max(0, grand - paid);
  const status = o.status || (paid >= grand ? 'PAID IN FULL' : paid > 0 ? 'PARTIALLY PAID' : 'UNPAID');
  const stamp = date + 'T' + time + ':00.000Z';
  return Object.assign({
    id: 'seed-' + n, number: 'RCT-' + String(n).padStart(6, '0'), date, time, payment: o.payment || 'Transfer', currency: 'NGN', template: 'classic',
    business: BIZ, customer: cust || { name: '', phone: '', email: '' },
    items: items.map((it) => ({ name: it.name, qty: it.qty, price: it.price, total: it.qty * it.price })),
    subtotal, discount, taxPct, tax, shipping, grand, paid, balance, status, notes: o.notes || '',
    createdAt: stamp, updatedAt: stamp, versions: [{ at: stamp, action: 'created' }], userId: UID, syncStatus: 'synced', deletedAt: null,
  }, o.extra || {});
}
const ADA = { name: 'Ada Obi', phone: '+2348021112222', phoneCountry: 'NG', email: 'ada@example.com' };
const SEED = [
  rec(1, d(-35), '10:00', ADA, [{ name: 'Rice bag', qty: 2, price: 25000 }], { status: 'PAID' }),
  rec(2, d(-20), '12:30', { name: 'ada obi', phone: '', email: '' }, [{ name: 'Beans (paint)', qty: 3, price: 4000 }], { shipping: 1500, paid: 5000 }),
  rec(3, d(-7), '15:05', { name: 'Chidi Okeke', phone: '+2348031234567', phoneCountry: 'NG', email: 'chidi@example.com' }, [{ name: 'Iron', qty: 1, price: 18000 }, { name: 'Rice bag', qty: 1, price: 25000 }], { discount: 3000, taxPct: 7.5, paid: 0, payment: 'POS' }),
  rec(4, d(-1), '17:45', ADA, [{ name: 'Blender', qty: 1, price: 35000 }], { payment: 'Cash' }),
  rec(5, d(0), '09:15', { name: 'Bisi Ade', phone: '08055550000', email: '' }, [{ name: 'Rice bag', qty: 1, price: 25000 }, { name: 'Oil (1L)', qty: 2, price: 3500 }], { paid: 20000 }),
  rec(6, d(0), '11:40', null, [{ name: 'Bread', qty: 4, price: 1200 }], { payment: 'Cash' }),
  rec(7, d(0), '12:00', { name: 'Chidi Okeke', phone: '', email: '' }, [{ name: 'Iron', qty: 1, price: 10000 }], { extra: { voided: true } }),
  rec(8, d(-1), '13:00', { name: 'Bisi Ade', phone: '', email: '' }, [{ name: 'Oil (1L)', qty: 2, price: 3500 }], { extra: { refunded: true } }),
  rec(9, d(0), '13:30', null, [{ name: 'Draft item', qty: 1, price: 99999 }], { paid: 0, extra: { isDraft: true } }),
];

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' };
function json(req, status, body) { return req.respond({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) }); }

/** opts.signedIn: seed session; opts.loginOk: password login succeeds. Records calls in opts.calls. */
async function setup(page, opts = {}) {
  const calls = opts.calls || [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if ((u.startsWith(SUPA) || u.startsWith(WORKER)) && req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    if (u.startsWith(WORKER)) {
      const p = new URL(u).pathname; calls.push(req.method() + ' ' + p);
      if (p === '/api/billing/status') return json(req, 200, { trial_ends_at: TRIAL_END, subscription: { status: 'trial' } });
      if (p === '/api/billing/plans') return json(req, 200, { plans: [{ code: 'monthly', label: 'Monthly', naira: 1500, months: 1 }, { code: 'quarterly', label: 'Quarterly', naira: 4275, months: 3 }, { code: 'semi_annual', label: 'Semi-annual', naira: 8100, months: 6 }, { code: 'annual', label: 'Annual', naira: 15300, months: 12 }] });
      if (p === '/api/billing/checkout') { calls.push('CHECKOUT!'); return json(req, 500, {}); }
      return json(req, 404, {});
    }
    if (u.startsWith(SUPA)) {
      const url = new URL(u); const p = url.pathname; calls.push(req.method() + ' ' + p);
      const obj = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
      const one = (o) => json(req, 200, obj ? o : [o]);
      if (p === '/auth/v1/user') return opts.signedIn || opts.loggedIn ? json(req, 200, user) : json(req, 401, { msg: 'no' });
      if (p === '/auth/v1/token') {
        if (opts.loginOk) { opts.loggedIn = true; return json(req, 200, session); }
        return json(req, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
      }
      if (p === '/auth/v1/logout') return req.respond({ status: 204, headers: cors });
      if (p === '/rest/v1/rpc/get_shared_receipt') { let tok = ''; try { tok = JSON.parse(req.postData() || '{}').share; } catch (e) {} const hit = (opts.shared || []).find((r) => r.shareToken === tok); return json(req, 200, hit || null); }
      if (req.method() !== 'GET') return req.respond({ status: 204, headers: cors });
      if (p === '/rest/v1/usage') return one({ trial_ends_at: TRIAL_END, last_active_at: new Date().toISOString() });
      if (p === '/rest/v1/subscriptions') return one({ status: 'trial', expires_at: null, plan_code: null, renewal_mode: null });
      if (p === '/rest/v1/profiles') return one({ deletion_requested_at: null, purge_after: null });
      return json(req, 200, obj ? null : []);
    }
    req.continue();
  });
  await page.evaluateOnNewDocument((sess, signedIn) => {
    try {
      localStorage.setItem('receiptly_install_dismiss', '1'); localStorage.setItem('receiptly_ios_install_dismiss', '1');
      if (signedIn && !sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); localStorage.setItem('receiptly-auth', JSON.stringify(sess)); }
    } catch (e) {}
  }, session, !!opts.signedIn);
}

/** Write SEED into receiptly_db (same schema as storage.js v2) on this origin. */
async function seed(page, base) {
  await page.goto(base + '/robots.txt');
  await page.evaluate((rows) => new Promise((resolve, reject) => {
    const req = indexedDB.open('receiptly_db', 2);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const s = db.createObjectStore('receipts', { keyPath: 'id' });
      s.createIndex('number', 'number', { unique: false }); s.createIndex('createdAt', 'createdAt', { unique: false });
      s.createIndex('date', 'date', { unique: false }); s.createIndex('status', 'status', { unique: false });
      db.createObjectStore('meta', { keyPath: 'key' }); db.createObjectStore('tombstones', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result; const tx = db.transaction(['receipts', 'meta'], 'readwrite');
      rows.forEach((r) => tx.objectStore('receipts').put(r));
      tx.objectStore('meta').put({ key: 'lastUserId', value: rows[0].userId });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  }), SEED);
}

function watchErrors(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
module.exports = { session, SUPA, WORKER, UID, SEED, d, setup, seed, watchErrors, sleep, TRIAL_END };
