/* eslint-disable @typescript-eslint/no-explicit-any */
import { config } from "./config";

// Port of js/analytics.js — same allow-list; receipt contents are never sent.
const ALLOWED: Record<string, boolean> = { currency: true, template: true, payment_method: true, payment_status: true, page: true };

export function analyticsReady(): boolean {
  const id = config.gaMeasurementId || "";
  return !!(config.analyticsEnabled && id && !/X{6,}|XXXXXXXXXX/i.test(id));
}

function clean(params?: Record<string, unknown>) {
  const out: Record<string, string> = {};
  if (!params) return out;
  Object.keys(params).forEach((k) => {
    if (!ALLOWED[k]) return;
    const v = params[k];
    if (v == null || v === "") return;
    out[k] = String(v).slice(0, 40);
  });
  return out;
}

function loadGtag() {
  const w = window as any;
  if (w.__receiptlyGtagLoaded || !analyticsReady()) return;
  w.__receiptlyGtagLoaded = true;
  const id = config.gaMeasurementId;
  w.dataLayer = w.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
  w.gtag("js", new Date());
  w.gtag("config", id, { anonymize_ip: true, send_page_view: true });
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
  document.head.appendChild(s);
}

export function track(name: string, params?: Record<string, unknown>) {
  const safe = clean(params);
  if (!config.analyticsEnabled) return;
  if (!analyticsReady()) {
    if (typeof console !== "undefined" && console.debug) console.debug("[Receipt Pilot analytics disabled/unconfigured]", name, safe);
    return;
  }
  loadGtag();
  const w = window as any;
  if (typeof w.gtag === "function") w.gtag("event", name, safe);
}
