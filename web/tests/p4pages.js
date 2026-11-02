// Phase 4: native notifications + admin pages vs the old copied pages (same mocks for both).
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { setup, watchErrors, sleep, UID } = require('./p2lib');
const NEW = 'http://localhost:3000', OLD = 'http://localhost:3001';
const out = '/workspace/next-shots/phase4'; fs.mkdirSync(out, { recursive: true });
const results = []; const check = (n, ok, x) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (x !== undefined && x !== '' ? '  ' + x : '')); };
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  async function open(base, path, opts, w = 375) {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.setViewport({ width: w, height: w === 375 ? 812 : 900, isMobile: w === 375, hasTouch: w === 375 });
    opts.calls = []; await setup(page, opts); const errs = watchErrors(page);
    if (opts.noticeSeen) await page.evaluateOnNewDocument((k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, 'rp_plan_notice_' + UID, new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
    await page.goto(base + path, { waitUntil: 'networkidle0' }); await sleep(3500);
    return { ctx, page, errs, calls: opts.calls };
  }

  // ---------- Notifications
  const notifText = (page) => page.evaluate(() => {
    const vis = (el) => !!(el && !el.hidden && el.offsetParent !== null);
    const gate = document.getElementById('notifGate'), content = document.getElementById('notifContent');
    const sections = content && vis(content) ? Array.from(content.querySelectorAll('section')).map((s) => ({ h: s.querySelector('h2').textContent, t: s.textContent, parts: Array.from(s.querySelectorAll('h2,p,dt,dd,span,a')).filter((e) => !e.querySelector('p,dt,dd,span,a')).map((e) => e.textContent) })) : [];
    const foot = content && vis(content) ? Array.from(content.querySelectorAll(':scope > p')).map((p) => p.textContent) : [];
    const links = content && vis(content) ? Array.from(content.querySelectorAll('a')).map((a) => [a.href, a.target, a.rel]) : [];
    return { gate: vis(gate), content: vis(content), gateText: vis(gate) ? gate.innerText : '', sections, foot, links };
  });
  for (const signedIn of [false, true]) {
    const o = await open(OLD, '/notifications.html', { signedIn });
    const n = await open(NEW, '/notifications', { signedIn, noticeSeen: true });
    const a = await notifText(o.page), b = await notifText(n.page);
    const label = signedIn ? 'signed in' : 'signed out';
    check('notifications ' + label + ': gate/content visibility same as old', a.gate === b.gate && a.content === b.content, JSON.stringify([[a.gate, a.content], [b.gate, b.content]]));
    if (!signedIn) {
      check('notifications signed out: gate copy same as old', norm(a.gateText) === norm(b.gateText), norm(b.gateText));
      await n.page.evaluate(() => Array.from(document.querySelectorAll('#notifGate button')).find((x) => /Account/.test(x.textContent)).click()); await sleep(800);
      check('notifications signed out: Account opens the sign-in dialog', /Welcome back|Log in|Sign in/i.test(await n.page.evaluate(() => (document.querySelector('[role=dialog]') || {}).innerText || '')));
      await n.page.keyboard.press('Escape'); await sleep(400);
      await n.page.screenshot({ path: out + '/notifications-signed-out-375.png' });
    } else {
      check('notifications signed in: 3 channels in the same order', JSON.stringify(a.sections.map((s) => s.h)) === JSON.stringify(b.sections.map((s) => s.h)), b.sections.map((s) => s.h).join(','));
      // every sentence of the old section text appears in the new one
      a.sections.forEach((s, i) => {
        const nt = norm(b.sections[i] && b.sections[i].t);
        const parts = s.parts.map(norm).filter(Boolean);
        const miss = parts.filter((x) => !nt.includes(x));
        check('notifications: ' + s.h + ' copy word for word', miss.length === 0, miss.join(' | '));
      });
      check('notifications: footer note word for word', norm(a.foot.join(' ')) === norm(b.foot.join(' ')), norm(b.foot.join(' ')).slice(0, 80));
      check('notifications: Meta docs link same (new tab, noopener)', JSON.stringify(a.links) === JSON.stringify(b.links), JSON.stringify(b.links));
      check('notifications: no Supabase writes', !n.calls.some((c) => /^(POST|PATCH|DELETE) \/rest\/v1\/(?!usage)/.test(c)), n.calls.join(','));
      await n.page.screenshot({ path: out + '/notifications-375.png' });
      await n.page.screenshot({ path: out + '/notifications-375-full.png', fullPage: true });
      const d = await open(NEW, '/notifications', { signedIn, noticeSeen: true }, 1280); await d.page.screenshot({ path: out + '/notifications-1280.png' }); await d.ctx.close();
    }
    check('no page errors (new notifications, ' + label + ')', n.errs.length === 0, JSON.stringify(n.errs));
    await o.ctx.close(); await n.ctx.close();
  }

  // ---------- Admin
  const adminView = (page) => page.evaluate(() => {
    const st = document.getElementById('adminStatus'); const wrap = document.getElementById('adminTableWrap');
    const stVis = st && !st.hidden && st.offsetParent !== null;
    const body = document.getElementById('adminBody');
    const rows = body ? Array.from(body.querySelectorAll('tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent)) : [];
    return { status: stVis ? st.textContent : '', statusErr: stVis ? /error|danger/.test(st.className) : null, table: !!(wrap && !wrap.hidden), rows };
  });
  const ROWS = [
    { email: 'ada@example.com', business_name: 'Ada <Foods>', deletion_requested_at: '2026-10-30T09:15:22.123+00:00', purge_after: '2026-11-29T09:15:22+00:00' },
    { email: null, business_name: '', deletion_requested_at: null, purge_after: '2026-12-01T00:00:00Z' },
  ];
  const scenarios = [
    ['signed out', { }],
    ['signed in, not an owner (rpc error)', { signedIn: true, adminDeny: true }],
    ['signed in, no requests', { signedIn: true, adminRows: [] }],
    ['signed in, 2 requests', { signedIn: true, adminRows: ROWS }],
  ];
  for (const [label, opts] of scenarios) {
    const o = await open(OLD, '/admin.html', { ...opts });
    const n = await open(NEW, '/admin', { ...opts }, 1280);
    const a = await adminView(o.page), b = await adminView(n.page);
    const ok = a.status === b.status && a.table === b.table && JSON.stringify(a.rows) === JSON.stringify(b.rows) && (a.statusErr === null) === (b.statusErr === null);
    check('admin ' + label + ': same status, table and rows as old', ok, JSON.stringify(b));
    const rpcOld = o.calls.filter((c) => /rpc\//.test(c)), rpcNew = n.calls.filter((c) => /rpc\//.test(c));
    check('admin ' + label + ': same Supabase rpc calls as old', JSON.stringify(rpcOld) === JSON.stringify(rpcNew), JSON.stringify(rpcNew));
    check('admin ' + label + ': no account/usage/billing calls (like admin.html)', !n.calls.some((c) => /\/rest\/v1\/(usage|subscriptions|profiles|receipts)|\/api\/billing/.test(c)), n.calls.join(','));
    check('no page errors (new admin, ' + label + ')', n.errs.length === 0, JSON.stringify(n.errs));
    if (label === 'signed in, 2 requests') {
      const m = await open(NEW, '/admin', { ...opts });
      const cards = await m.page.evaluate(() => Array.from(document.querySelectorAll('ul[aria-label="Deletion requests"] li')).map((li) => li.innerText.replace(/\s+/g, ' ')));
      check('admin phone: one card per request with the same fields', cards.length === 2 && cards[0].includes('ada@example.com') && cards[0].includes('Ada Foods>') && cards[0].includes('2026-10-30 09:15'), JSON.stringify(cards));
      await m.page.screenshot({ path: out + '/admin-375.png' });
      await n.page.screenshot({ path: out + '/admin-1280.png' });
      await m.ctx.close();
    }
    if (label === 'signed in, not an owner (rpc error)') { const m = await open(NEW, '/admin', { ...opts }); await m.page.screenshot({ path: out + '/admin-denied-375.png' }); await m.ctx.close(); }
    await o.ctx.close(); await n.ctx.close();
  }
  await browser.close();
  console.log(results.filter((r) => r.ok).length + '/' + results.length + ' passed');
})();
