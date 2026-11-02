// History search/open/re-download/share + auth redirects and old-URL aliases.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { SEED, setup, seed, watchErrors, sleep } = require('./p2lib');
const base = 'http://localhost:3000';
const out = '/workspace/next-shots/phase2/tests'; fs.mkdirSync(out + '/dl', { recursive: true });
for (const f of fs.readdirSync(out + '/dl')) fs.unlinkSync(out + '/dl/' + f);
const results = []; const check = (n, ok, x) => { results.push({ n, ok: !!ok, x }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const fresh = async (opts, w = 375) => {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.setViewport({ width: w, height: w === 375 ? 812 : 900, isMobile: w === 375, hasTouch: w === 375 });
    await setup(page, opts); const errs = watchErrors(page);
    const navs = []; page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url().replace(base, '')); });
    return { ctx, page, errs, navs };
  };
  const text = (page) => page.evaluate(() => document.body.innerText);

  // ---------- History (signed in, seeded)
  {
    const { ctx, page, errs } = await fresh({ signedIn: true });
    const cdp = await page.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out + '/dl', browserContextId: ctx.id, eventsEnabled: true });
    await seed(page, base);
    await page.goto(base + '/records', { waitUntil: 'networkidle0' }); await sleep(1800);
    const listed = () => page.evaluate(() => Array.from(document.querySelectorAll('ul[aria-label="Receipts"] li')).map((li) => (li.textContent.match(/RCT-\d+/) || [''])[0]));
    const all = await listed();
    const visibleSeed = SEED.map((r) => r.number);
    const setSearch = (v) => page.evaluate((v) => { const el = document.getElementById('search'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    check('history lists all seeded receipts (incl. draft, voided, refunded)', visibleSeed.every((n) => all.includes(n)), all.join(','));
    const hay = (r) => [r.number, r.notes, r.customer && r.customer.name, r.customer && r.customer.phone, r.customer && r.customer.email, r.business && r.business.name].join(' ').toLowerCase();
    for (const q of ['chidi', 'RCT-000005', '0805555', 'ada@example', 'zzz-no-match']) {
      await setSearch(q); await sleep(700);
      const got = (await listed()).sort();
      const exp = SEED.filter((r) => hay(r).includes(q.toLowerCase())).map((r) => r.number).sort();
      check('history search "' + q + '" → ' + (exp.join(',') || 'none'), JSON.stringify(got) === JSON.stringify(exp), got.join(',') || '(empty)');
    }
    await setSearch(''); await page.type('#search', 'Bisi'); await sleep(600);
    await page.evaluate(() => { const li = Array.from(document.querySelectorAll('ul[aria-label="Receipts"] li')).find((l) => l.textContent.includes('RCT-000005')); li.querySelector('button').click(); }); await sleep(1200);
    const t = await text(page);
    check('tap opens receipt preview (RCT-000005)', /Receipt preview/.test(t) && t.includes('RCT-000005'));
    await page.screenshot({ path: out + '/history-preview-375.png' });
    const clickBtn = (label) => page.evaluate((label) => { const b = Array.from(document.querySelectorAll('[role=dialog] button')).find((x) => x.textContent.trim() === label); if (b) { b.click(); return true; } return false; }, label);
    const okPdf = await clickBtn('PDF'); await sleep(5000);
    const okImg = await clickBtn('Image'); await sleep(4000);
    console.log('clicked', okPdf, okImg, (await text(page)).slice(-300).replace(/\s+/g,' '));
    const dl = fs.readdirSync(out + '/dl');
    check('re-download PDF from history', dl.some((f) => f === 'RCT-000005.pdf'), dl.join(','));
    check('re-download PNG from history', dl.some((f) => f.endsWith('.png') && f.includes('RCT-000005')), dl.join(','));
    await clickBtn('Send'); await sleep(1500);
    const st = await text(page);
    check('share sheet opens from history (WhatsApp, Copy link)', /WhatsApp/.test(st) && /Copy link/i.test(st));
    await page.screenshot({ path: out + '/history-share-375.png' });
    check('no page errors on history', errs.length === 0, JSON.stringify(errs));
    await ctx.close();
  }

  // ---------- Auth redirects (signed out)
  for (const p of ['/app', '/sales?x=1', '/customers', '/records?view=seed-5']) {
    const { ctx, page } = await fresh({});
    await page.goto(base + p, { waitUntil: 'networkidle0' }); await sleep(1200);
    const u = page.url().replace(base, '');
    check('signed-out ' + p + ' → /signin?next=' + encodeURIComponent(p), u === '/signin?next=' + encodeURIComponent(p), u);
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh({});
    await page.goto(base + '/new', { waitUntil: 'networkidle0' }); await sleep(1200);
    check('signed-out /new stays open (guest receipt flow unchanged)', page.url() === base + '/new', page.url());
    await ctx.close();
  }
  for (const [start, expectEnd] of [['/sales?x=1', '/sales?x=1'], ['/signin', '/app'], ['/records?view=seed-5', '/records?view=seed-5']]) {
    const opts = { loginOk: true };
    const { ctx, page, errs } = await fresh(opts);
    await page.goto(base + start, { waitUntil: 'networkidle0' }); await sleep(1200);
    await page.type('input[type=email]', 'owner@example.com'); await page.type('input[type=password]', 'correct-horse-1');
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Log in').click());
    await sleep(3500);
    const u = page.url().replace(base, '');
    check('sign in from ' + start + ' returns to ' + expectEnd, u === expectEnd, u);
    if (start === '/signin') check('no page errors during sign-in → dashboard', errs.length === 0, JSON.stringify(errs));
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh({ signedIn: true });
    await page.goto(base + '/signin', { waitUntil: 'networkidle0' }); await sleep(2000);
    check('signed-in user opening /signin goes to /app', page.url() === base + '/app', page.url());
    await page.goto(base + '/signin?mode=signup', { waitUntil: 'networkidle0' }); await sleep(2000);
    check('signed-in user opening sign-up goes to /app', page.url() === base + '/app', page.url());
    await ctx.close();
  }
  // Email links land on "/" (Supabase redirect) and are forwarded.
  {
    const { ctx, page, navs } = await fresh({});
    await page.goto(base + '/?code=abc123', { waitUntil: 'networkidle0' }); await sleep(1500);
    check('confirmation link /?code=… is forwarded to /app?code=… (query kept)', navs.some((u) => u.startsWith('/app?code=abc123')), navs.join(' → '));
    await ctx.close();
  }
  {
    const { ctx, page, navs } = await fresh({ signedIn: true });
    await page.goto(base + '/#access_token=xyz&type=signup', { waitUntil: 'networkidle0' }); await sleep(2000);
    check('implicit link /#access_token=…&type=signup → /app (hash kept for Supabase)', navs.some((u) => u.startsWith('/app#access_token=xyz')), navs.join(' → '));
    check('…and the user lands on the dashboard', page.url().startsWith(base + '/app'), page.url());
    await ctx.close();
  }
  {
    const { ctx, page, navs } = await fresh({});
    await page.goto(base + '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', { waitUntil: 'networkidle0' }); await sleep(1500);
    const t = await text(page);
    check('expired email link → /signin with the expiry message', page.url().startsWith(base + '/signin') && t.includes('This email link has expired'), navs.join(' → '));
    await ctx.close();
  }
  for (const [from, to] of [['/#signin', '/signin'], ['/#generator', '/new'], ['/?edit=seed-5', '/new?edit=seed-5']]) {
    const { ctx, page, navs } = await fresh({});
    await page.goto(base + from, { waitUntil: 'networkidle0' }); await sleep(1200);
    check('old link ' + from + ' → ' + to, navs.some((u) => u === to || u.startsWith(to)), navs.join(' → '));
    await ctx.close();
  }
  // Old .html URLs (server behaves like Cloudflare: 307 keeping the query).
  for (const [from, to] of [['/records.html?view=seed-5', '/records?view=seed-5'], ['/sales.html', '/sales'], ['/customers.html', '/customers'], ['/billing.html?reference=rp-abc-123456&trxref=rp-abc-123456', '/billing?reference=rp-abc-123456&trxref=rp-abc-123456'], ['/index.html', '/'], ['/new', '/new']]) {
    const r = await fetch(base + from, { redirect: 'manual' });
    const loc = r.status === 307 ? r.headers.get('location') : from;
    const final = await fetch(base + from);
    check('URL ' + from + ' → ' + to + ' (' + r.status + ', final ' + final.status + ')', loc === to && final.status === 200, r.status + ' ' + loc);
  }
  await browser.close();
  fs.writeFileSync(out + '/history-auth-results.json', JSON.stringify(results, null, 2));
  console.log(results.filter((r) => r.ok).length + '/' + results.length + ' passed');
})();
