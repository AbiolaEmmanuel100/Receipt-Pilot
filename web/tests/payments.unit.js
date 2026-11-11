// Unit tests for lib/payments.ts + receipt markup + sales filter + sync row mapping.
// Run: node tests/payments.unit.js   (compiles the TS libs with the project's tsc into a temp dir)
const { execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-pay-'));
const root = path.join(__dirname, '..');
execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['lib/payments.ts', 'lib/calc.ts', 'lib/receipt.ts', 'lib/val.ts', 'lib/sales.ts', 'lib/types.ts',
  '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--esModuleInterop', '--lib', 'es2020,dom'], { cwd: root, stdio: 'inherit' });
global.location = { origin: 'https://receipt-pilot.com', pathname: '/records' };
const P = require(path.join(out, 'payments.js'));
const R = require(path.join(out, 'receipt.js'));
const SL = require(path.join(out, 'sales.js'));
let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) pass++; else fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (x !== undefined && !ok ? '  ' + JSON.stringify(x) : '')); };
const throws = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

const NOW = new Date(2026, 10, 11, 12, 0, 0);
const base = () => ({ id: 'r1', number: 'RCT-000010', date: '2026-11-01', time: '10:00', payment: 'Cash', currency: 'NGN', template: 'classic',
  business: { name: 'Test Biz' }, customer: { name: 'Ada' }, items: [{ name: 'Rice', qty: 2, price: 25000, total: 50000 }],
  subtotal: 50000, discount: 0, taxPct: 0, tax: 0, shipping: 0, grand: 50000, paid: 20000, balance: 30000, status: 'PARTIALLY PAID',
  createdAt: '2026-11-01T09:00:00.000Z', updatedAt: '2026-11-01T09:00:00.000Z', versions: [{ at: '2026-11-01T09:00:00.000Z', action: 'created' }] });

// Legacy receipt
const legacy = base();
check('legacy: no history', !P.hasPaymentHistory(legacy));
check('legacy: owing', P.isOwing(legacy));
check('legacy: payment locked (owing)', P.paymentLocked(legacy));
check('legacy: amounts not locked', !P.amountsLocked(legacy));
check('legacy: issuePaid = paid', P.issuePaid(legacy) === 20000);
const paidLegacy = Object.assign(base(), { paid: 50000, balance: 0, status: 'PAID' });
check('paid legacy: not owing / not locked', !P.isOwing(paidLegacy) && !P.paymentLocked(paidLegacy));
check('draft not owing', !P.isOwing(Object.assign(base(), { isDraft: true })));
check('voided not owing', !P.isOwing(Object.assign(base(), { voided: true })));
check('refunded not owing', !P.isOwing(Object.assign(base(), { refunded: true })));
check('trashed not owing', !P.isOwing(Object.assign(base(), { deletedAt: '2026-11-02' })));

// Legacy receipt markup unchanged (golden from the pre-change renderer, minus nothing)
const legacyHtml = R.receiptHtml(legacy).html;
check('legacy markup has no payment history', legacyHtml.indexOf('r-payments') === -1 && legacyHtml.indexOf('Paid in full on') === -1);
const goldens = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/legacy-receipts.json'), 'utf8'));
goldens.forEach((g, i) => check('legacy receipt ' + (i + 1) + ' markup identical to the pre-change renderer', JSON.stringify(R.receiptHtml(g.record)) === JSON.stringify(g.out)));

// Validation
const v = (amt, date = '2026-11-10', extra = {}) => P.validatePayment(legacy, Object.assign({ amount: amt, date }, extra), NOW);
check('valid partial', v('5000') === '');
check('valid with comma', v('5,000.50') === '');
check('blocks zero', /greater than 0/.test(v('0')));
check('blocks negative', v('-5') !== '');
check('blocks text', v('abc') !== '');
check('blocks 3 decimals', v('10.123') !== '');
check('blocks empty', v('') !== '');
check('blocks overpayment', /more than the balance/.test(v('30000.01')));
check('allows exact balance', v('30000') === '');
check('blocks future date', /future/.test(v('100', '2026-11-12')));
check('blocks before receipt date', /before the receipt date/.test(v('100', '2026-10-31')));
check('blocks bad date', v('100', '2026-02-30') !== '');
check('blocks long note', v('100', '2026-11-10', { note: 'x'.repeat(121) }) !== '');
check('blocks paid receipt', /no balance/.test(P.validatePayment(paidLegacy, { amount: '1', date: '2026-11-10' }, NOW)));
check('blocks voided receipt', /cancelled/.test(P.validatePayment(Object.assign(base(), { voided: true }), { amount: '1', date: '2026-11-10' }, NOW)));

// Partial payment
const r1 = P.recordPayment(legacy, { amount: '10000', date: '2026-11-05', method: 'Bank Transfer', note: '2nd instalment' }, NOW);
check('partial: paid 30000', r1.paid === 30000, r1.paid);
check('partial: balance 20000', r1.balance === 20000);
check('partial: status PARTIALLY PAID', r1.status === 'PARTIALLY PAID');
check('partial: paidAtIssue captured', r1.paidAtIssue === 20000);
check('partial: 1 payment', r1.payments.length === 1 && r1.payments[0].method === 'Bank Transfer' && r1.payments[0].note === '2nd instalment');
check('partial: version logged', /payment recorded ₦10,000.00/.test(r1.versions[r1.versions.length - 1].action));
check('partial: pending sync + updatedAt', r1.syncStatus === 'pending' && r1.updatedAt === NOW.toISOString());
check('partial: original not mutated', legacy.paid === 20000 && !legacy.payments);
check('partial: grand untouched', r1.grand === 50000 && r1.items.length === 1);
check('after payment: amounts locked', P.amountsLocked(r1));

// Multiple + clearance
const r2 = P.recordPayment(r1, { amount: 7500.5, date: '2026-11-08', method: 'Cash' }, NOW);
check('multiple: balance 12499.50', r2.balance === 12499.5, r2.balance);
const over = throws(() => P.recordPayment(r2, { amount: '12499.51', date: '2026-11-09' }, NOW));
check('multiple: overpayment throws', /more than the balance/.test(over), over);
const r3 = P.recordPayment(r2, { amount: '12499.50', date: '2026-11-09', method: 'POS' }, NOW);
check('clear: balance 0', r3.balance === 0);
check('clear: PAID IN FULL', r3.status === 'PAID IN FULL');
check('clear: paidInFullOn = date', r3.paidInFullOn === '2026-11-09');
check('clear: paid = grand', r3.paid === 50000);
check('clear: no more payments', /no balance/.test(P.validatePayment(r3, { amount: '1', date: '2026-11-10' }, NOW)));
check('clear: still edit-locked', P.paymentLocked(r3) && P.amountsLocked(r3));
// float accumulation
let f = Object.assign(base(), { grand: 0.3, paid: 0, balance: 0.3, status: 'UNPAID', items: [{ name: 'x', qty: 1, price: 0.3, total: 0.3 }] });
f = P.recordPayment(f, { amount: '0.1', date: '2026-11-10' }, NOW); f = P.recordPayment(f, { amount: '0.2', date: '2026-11-10' }, NOW);
check('cents-exact: 0.1 + 0.2 clears 0.3', f.status === 'PAID IN FULL' && f.balance === 0 && f.paid === 0.3, f);

// Undo
const u = P.undoLastPayment(r3, NOW);
check('undo: balance back to 12499.50', u.balance === 12499.5 && u.status === 'PARTIALLY PAID');
check('undo: paidInFullOn cleared', !('paidInFullOn' in u));
check('undo: kept in undonePayments', u.undonePayments.length === 1 && u.undonePayments[0].amount === 12499.5 && u.undonePayments[0].undoneAt);
check('undo: version logged', /payment undone/.test(u.versions[u.versions.length - 1].action));
const u2 = P.undoLastPayment(P.undoLastPayment(u, NOW), NOW);
check('undo all: back to issue state', u2.paid === 20000 && u2.balance === 30000 && u2.status === 'PARTIALLY PAID' && u2.payments.length === 0);
check('undo with none throws', /no recorded payment/.test(throws(() => P.undoLastPayment(u2, NOW))));
const unpaid = Object.assign(base(), { paid: 0, balance: 50000, status: 'UNPAID' });
const up1 = P.recordPayment(unpaid, { amount: '50000', date: '2026-11-10' }, NOW);
check('unpaid -> paid in one payment', up1.status === 'PAID IN FULL' && up1.paidAtIssue === 0);
check('unpaid undo -> UNPAID', P.undoLastPayment(up1, NOW).status === 'UNPAID');

// Edit lock
const edited = P.applyEditLock(r2, { grand: 99999, paid: 99999, status: 'PAID IN FULL', items: [], notes: 'new note', currency: 'USD' });
check('edit lock: status/paid not overwritable', edited.paid === r2.paid && edited.status === 'PARTIALLY PAID' && edited.balance === r2.balance);
check('edit lock: amounts kept once payments exist', edited.grand === 50000 && edited.items.length === 1 && edited.currency === 'NGN');
check('edit lock: non-financial fields still edit', edited.notes === 'new note');
const e2 = P.applyEditLock(legacy, { grand: 60000, paid: 60000, status: 'PAID IN FULL', items: [{ name: 'Rice', qty: 3, price: 20000, total: 60000 }] });
check('edit lock (owing, no payments): items editable, paid kept', e2.grand === 60000 && e2.paid === 20000 && e2.balance === 40000 && e2.status === 'PARTIALLY PAID');
check('edit lock: total below paid blocked', /already paid/.test(P.editLockError(legacy, { grand: 20000 })));
check('edit lock: paid receipt unaffected', P.applyEditLock(paidLegacy, { status: 'UNPAID', paid: 0 }).status === 'UNPAID');

// Receipt markup with history
const html = R.receiptHtml(r2).html;
check('markup: payment history block', html.indexOf('Payment history') > -1);
check('markup: opening row', html.indexOf('Paid when issued · Cash') > -1 && html.indexOf('₦20,000.00') > -1);
check('markup: each payment row', html.indexOf('Bank Transfer · 2nd instalment') > -1 && html.indexOf('₦10,000.00') > -1 && html.indexOf('₦7,500.50') > -1);
check('markup: totals', html.indexOf('Total paid') > -1 && html.indexOf('₦37,500.50') > -1 && html.indexOf('Balance remaining') > -1 && html.indexOf('₦12,499.50') > -1);
check('markup: original grand total kept', html.indexOf('₦50,000.00') > -1);
const html3 = R.receiptHtml(r3).html;
check('markup: paid in full + date', html3.indexOf('PAID IN FULL') > -1 && html3.indexOf('Paid in full on') > -1 && html3.indexOf('2026-11-09') > -1);
const xss = R.receiptHtml(P.recordPayment(legacy, { amount: '1', date: '2026-11-10', note: '<img src=x onerror=alert(1)>' }, NOW)).html;
check('markup: note escaped', xss.indexOf('<img src=x') === -1);

// Sales filter
const list = [legacy, paidLegacy, r3, unpaid, Object.assign(base(), { id: 'v', voided: true })];
check('sales owing filter', SL.productSource(list, 'owing').map((r) => r.id).join() === 'r1,r1', SL.productSource(list, 'owing').map((r) => r.id));
check('sales summary uses updated paid', SL.summarize([r2]).paid === 37500.5 && SL.summarize([r2]).outstanding === 12499.5);

// Sync round trip (same mapping as lib/sync.ts toRow/fromRow: payload holds the whole object)
const srcSync = fs.readFileSync(path.join(root, 'lib/sync.ts'), 'utf8');
check('sync: toRow keeps full payload', /const payload: any = Object\.assign\(\{\}, record\);/.test(srcSync) && /payload,\n/.test(srcSync));
const row = { id: r2.id, payload: JSON.parse(JSON.stringify(Object.assign({}, r2))), amount_paid: r2.paid, outstanding: r2.balance, payment_status: r2.status, total: r2.grand };
const back = Object.assign({}, row.payload, { paid: row.amount_paid, balance: row.outstanding, status: row.payment_status, grand: row.total });
check('sync: payments survive JSON round trip', JSON.stringify(back.payments) === JSON.stringify(r2.payments) && back.paidAtIssue === 20000);
check('sync: rendered markup identical after round trip', R.receiptHtml(back).html === html);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
fs.rmSync(out, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
