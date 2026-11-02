// Tiny static server that mimics Cloudflare static assets (auto-trailing-slash):
// /x.html -> 307 /x (query kept), /x -> x.html, /x/ -> x/index.html, 404.html fallback.
import http from "node:http";
import zlib from "node:zlib";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
const root = process.argv[2]; const port = Number(process.argv[3] || 3000);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".txt": "text/plain", ".xml": "application/xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const file = (p) => { const f = join(root, normalize(p)); return existsSync(f) && statSync(f).isFile() ? f : null; };
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"); let p = decodeURIComponent(u.pathname);
  if (p.endsWith(".html")) { const clean = p === "/index.html" ? "/" : p.slice(0, -5); res.writeHead(307, { Location: clean + u.search }); return res.end(); }
  let f = p === "/" ? file("index.html") : file(p) || file(p + ".html") || file(join(p, "index.html"));
  let code = 200; if (!f) { f = file("404.html"); code = 404; }
  const ext = extname(f);
  const headers = { "Content-Type": types[ext] || "application/octet-stream" };
  if (p.startsWith("/_next/static/")) headers["Cache-Control"] = "public, max-age=31536000, immutable";
  const gz = /\.(html|js|css|json|svg|txt|xml)$/.test(f) && /gzip/.test(req.headers["accept-encoding"] || "");
  if (gz) { headers["Content-Encoding"] = "gzip"; headers["Vary"] = "Accept-Encoding"; }
  res.writeHead(code, headers); const s = createReadStream(f); (gz ? s.pipe(zlib.createGzip()) : s).pipe(res);
}).listen(port, () => console.log("cfserve on " + port));
