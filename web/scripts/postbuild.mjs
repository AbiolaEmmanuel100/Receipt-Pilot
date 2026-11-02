// After `next build` (static export to out/):
// Every page is now a native Next page (Phase 4: notifications and admin too),
// so nothing is copied from the old site any more. This script only checks
// that the files the outside world depends on exist (Paystack callback
// billing.html, email links, old bookmarks, PWA files).
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "out");

const REQUIRED = ["index.html", "app.html", "new.html", "sales.html", "customers.html", "records.html", "billing.html", "signin.html", "reset.html", "r.html", "404.html",
  "about.html", "privacy-policy.html", "terms.html", "notifications.html", "admin.html", "sw.js", "manifest.json", "robots.txt", "sitemap.xml"];
const missing = REQUIRED.filter((f) => !existsSync(join(out, f)));
if (missing.length) {
  console.error("postbuild: missing in out/: " + missing.join(", "));
  process.exit(1);
}
console.log(`postbuild: all ${REQUIRED.length} required files present.`);
