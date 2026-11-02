/* Receipt Pilot service worker (Next.js build).
   - /_next/static/* is content-hashed: cache-first.
   - Pages and other same-origin files: network-first, cached copy when offline.
   - Old "receiptly-*" caches from the previous site are removed on activate. */
const CACHE = "rp-next-v3";
const PRECACHE = ["/app", "/new", "/records", "/sales", "/customers", "/notifications", "/", "/manifest.json", "/assets/favicon.svg", "/assets/icon-192.png", "/assets/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function put(req, res) {
  if (res && res.ok && res.type === "basic") {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, Worker API, fonts: never cached here
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }

  event.respondWith(
    fetch(req).then((res) => put(req, res)).catch(() =>
      caches.match(req, { ignoreSearch: req.mode === "navigate" }).then((hit) => {
        if (hit) return hit;
        if (req.mode === "navigate") return caches.match("/app");
        return new Response("", { status: 504, statusText: "Offline" });
      })
    )
  );
});
