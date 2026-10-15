/* Receipt Pilot service worker — caches the app shell for offline use. */
const CACHE = "receiptly-v32";
const PRECACHE = [
  "./",
  "./index.html",
  "./records.html",
  "./about.html",
  "./privacy-policy.html",
  "./terms.html",
  "./css/styles.css",
  "./css/print.css",
  "./css/responsive.css",
  "./js/storage.js",
  "./js/calculations.js",
  "./js/validation.js",
  "./js/receipt.js",
  "./js/pdf.js",
  "./js/export.js",
  "./js/ui.js",
  "./js/app.js",
  "./js/records.js",
  "./js/pwa.js",
  "./js/config.js",
  "./js/analytics.js",
  "./js/errors.js",
  "./js/supabase.js",
  "./js/account.js",
  "./js/usage.js",
  "./js/share.js",
  "./js/activity.js",
  "./customers.html",
  "./admin.html",
  "./js/admin.js",
  "./r.html",
  "./js/sync.js",
  "./js/templates.js",
  "./js/sales.js",
  "./sales.html",
  "./reset.html",
  "./404.html",
  "./assets/og-image.png",
  "./manifest.json",
  "./assets/favicon.svg",
  "./assets/icon-96.png",
  "./assets/icon-128.png",
  "./assets/icon-180.png",
  "./assets/icon-192.png",
  "./assets/icon-256.png",
  "./assets/icon-384.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-192.png",
  "./assets/icon-maskable-512.png",
  "./assets/apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  if (url.hostname.indexOf("supabase.co") !== -1) return;
  var sameOrigin = url.origin === self.location.origin;

  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && (sameOrigin || /jsdelivr\.net|googleapis\.com|gstatic\.com/.test(url.hostname))) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (cached) {
        if (cached) return cached;
        if (req.mode === "navigate") return caches.match("./index.html");
        return new Response("", { status: 504, statusText: "Offline" });
      });
    })
  );
});
