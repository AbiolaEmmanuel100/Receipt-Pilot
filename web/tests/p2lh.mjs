// Lighthouse mobile (default throttling) on signed-in /app and /records, with mocked Supabase/Worker + seeded receipts.
import puppeteer from 'puppeteer-core';
import lighthouse from 'lighthouse';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { setup, seed } = require('./p2lib.js');
const base = 'http://localhost:3000';
const out = '/workspace/next-shots/phase2/lighthouse'; fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
for (const path of ['/app', '/records']) {
  const page = await browser.newPage();
  await setup(page, { signedIn: true });
  await seed(page, base);
  await page.goto(base + path, { waitUntil: 'networkidle0' });
  const r = await lighthouse(base + path, { disableStorageReset: true, output: 'html', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'], formFactor: 'mobile' }, undefined, page);
  const c = r.lhr.categories; const a = r.lhr.audits;
  const name = path.slice(1);
  fs.writeFileSync(out + '/' + name + '.html', r.report);
  console.log(path, 'final=' + r.lhr.finalDisplayedUrl, Object.entries(c).map(([k, v]) => k + '=' + Math.round(v.score * 100)).join(' '),
    'FCP=' + a['first-contentful-paint'].displayValue, 'LCP=' + a['largest-contentful-paint'].displayValue, 'TBT=' + a['total-blocking-time'].displayValue, 'CLS=' + a['cumulative-layout-shift'].displayValue,
    'console-errors=' + (a['errors-in-console'].score === 1 ? 'none' : JSON.stringify((a['errors-in-console'].details || {}).items)));
  for (const [k, v] of Object.entries(a)) if (v.score !== null && v.score < 0.9 && ['accessibility'].some((cat) => c[cat].auditRefs.some((x) => x.id === k))) console.log('  a11y:', k, v.title);
  await page.close();
}
await browser.close();
