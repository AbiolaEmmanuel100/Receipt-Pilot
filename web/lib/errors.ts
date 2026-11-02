import { getClient } from "./cloud";

// Port of js/errors.js
export function report(message: unknown, source?: string) {
  const msg = String(message || "Unknown error").slice(0, 180);
  const src = String(source || "app").slice(0, 40);
  if (typeof console !== "undefined" && console.error) console.error("[Receipt Pilot]", src, msg);
  try {
    const c = getClient();
    if (!c) return;
    Promise.resolve(c.from("error_events").insert({ source: src, message: msg, created_at: new Date().toISOString() })).catch(() => {});
  } catch { /* never block the app */ }
}

let installed = false;
export function installGlobalHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => report((e && e.message) || "script error", "window"));
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e && e.reason;
    report((reason && reason.message) || String(reason || "promise"), "promise");
  });
}
