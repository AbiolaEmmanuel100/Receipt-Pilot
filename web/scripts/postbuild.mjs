// After `next build` (static export to out/):
// 1. Copy the legacy pages that are not rebuilt yet (Phase 2) with the js/ and
//    css/ they need, so every current URL keeps working on the new build.
// 2. Point their "index.html" links at the new generator (/new).
// 3. Check that the files the outside world depends on exist.
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const root = join(web, "..");
const out = join(web, "out");

// sales.html and customers.html are now native Next pages (out/sales.html, out/customers.html).
const LEGACY_PAGES = ["notifications.html", "admin.html"];
const LEGACY_DIRS = ["js", "css"];

for (const d of LEGACY_DIRS) cpSync(join(root, d), join(out, d), { recursive: true });
for (const p of LEGACY_PAGES) cpSync(join(root, p), join(out, p));

function rewrite(file) {
  const before = readFileSync(file, "utf8");
  const after = before
    .replace(/(["'])(?:\.\/)?index\.html#generator\1/g, "$1/new$1")
    .replace(/href=(["'])(?:\.\/)?index\.html\1/g, "href=$1/app$1")
    .replace(/(["'])(?:\.\/)?index\.html([?#])/g, "$1/new$2");
  if (after !== before) writeFileSync(file, after);
  return after !== before;
}
let changed = 0;
for (const p of LEGACY_PAGES) changed += rewrite(join(out, p)) ? 1 : 0;
for (const f of readdirSync(join(out, "js"))) {
  const full = join(out, "js", f);
  if (statSync(full).isFile() && f.endsWith(".js")) changed += rewrite(full) ? 1 : 0;
}

const REQUIRED = ["index.html", "app.html", "new.html", "sales.html", "customers.html", "records.html", "billing.html", "signin.html", "reset.html", "r.html", "404.html",
  "about.html", "privacy-policy.html", "terms.html", "sw.js", "manifest.json", "robots.txt", "sitemap.xml", ...LEGACY_PAGES];
const missing = REQUIRED.filter((f) => !existsSync(join(out, f)));
if (missing.length) {
  console.error("postbuild: missing in out/: " + missing.join(", "));
  process.exit(1);
}
console.log(`postbuild: copied ${LEGACY_PAGES.length} legacy pages + js/ css/, rewrote links in ${changed} files; all ${REQUIRED.length} required files present.`);
