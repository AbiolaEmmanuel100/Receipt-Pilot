import type { Receipt } from "@/lib/types";
import { money } from "@/lib/calc";

// Pure helpers ported from js/records.js
function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - (day === 0 ? 6 : day - 1));
  x.setHours(0, 0, 0, 0);
  return x;
}
export function dateKey(dateStr: unknown) {
  if (!dateStr) return "";
  const s = String(dateStr).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) return dmy[3] + "-" + String(dmy[2]).padStart(2, "0") + "-" + String(dmy[1]).padStart(2, "0");
  return "";
}
function timeKey(t: unknown) {
  const m = String(t || "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return "00:00:00";
  return String(m[1]).padStart(2, "0") + ":" + m[2] + ":" + String(m[3] || "00");
}
function seqFromNumber(n: unknown) { const m = String(n || "").match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) || 0 : 0; }
function sortStamp(r: Receipt) { const day = dateKey(r && r.date); return day ? day + "T" + timeKey(r && r.time) : String((r && r.createdAt) || ""); }
function iso(d: Date) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

export interface Filters {
  q: string; qNum: string; qCust: string; qPhone: string; status: string; method: string; currency: string;
  range: string; from: string; to: string; sort: string;
}
export const DEFAULT_FILTERS: Filters = { q: "", qNum: "", qCust: "", qPhone: "", status: "all", method: "all", currency: "all", range: "all", from: "", to: "", sort: "newest" };

export function isFiltered(f: Filters) {
  return f.range !== "all" || !!f.q.trim() || !!f.qNum || !!f.qCust || !!f.qPhone || f.status !== "all" || f.method !== "all" || f.currency !== "all";
}

export function applyFilters(all: Receipt[], f: Filters): Receipt[] {
  const q = f.q.trim().toLowerCase(), qNum = f.qNum.trim().toLowerCase(), qCust = f.qCust.trim().toLowerCase(), qPhone = f.qPhone.trim().toLowerCase();
  const today = new Date();
  let from = "0000-01-01", to = "9999-12-31";
  if (f.range === "today") from = to = iso(today);
  else if (f.range === "yesterday") { const y = new Date(today); y.setDate(y.getDate() - 1); from = to = iso(y); }
  else if (f.range === "week") { from = iso(startOfWeek(today)); to = iso(today); }
  else if (f.range === "month") { from = iso(new Date(today.getFullYear(), today.getMonth(), 1)); to = iso(today); }
  else if (f.range === "lastMonth") { from = iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)); to = iso(new Date(today.getFullYear(), today.getMonth(), 0)); }
  else if (f.range === "year") { from = iso(new Date(today.getFullYear(), 0, 1)); to = iso(today); }
  else if (f.range === "custom") { from = f.from || from; to = f.to || to; }
  const out = all.filter((r) => {
    if (f.range !== "all") { const k = dateKey(r.date); if (!k || !(k >= from && k <= to)) return false; }
    if (f.status !== "all") { const rs = r.status === "PAID" ? "PAID IN FULL" : r.status; if (rs !== f.status) return false; }
    if (f.method !== "all" && r.payment !== f.method) return false;
    if (f.currency !== "all" && r.currency !== f.currency) return false;
    if (qNum && String(r.number || "").toLowerCase().indexOf(qNum) === -1) return false;
    if (qCust && String((r.customer && r.customer.name) || "").toLowerCase().indexOf(qCust) === -1) return false;
    if (qPhone && String((r.customer && r.customer.phone) || "").toLowerCase().indexOf(qPhone) === -1) return false;
    if (q) {
      const hay = [r.number, r.notes, r.customer && r.customer.name, r.customer && r.customer.phone, r.customer && r.customer.email, r.business && r.business.name].join(" ").toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  out.sort((a, b) => {
    if (f.sort === "high") return (b.grand || 0) - (a.grand || 0);
    if (f.sort === "low") return (a.grand || 0) - (b.grand || 0);
    if (f.sort === "number") return String(a.number).localeCompare(String(b.number));
    const sa = sortStamp(a), sb = sortStamp(b);
    if (sa !== sb) return f.sort === "oldest" ? (sa > sb ? 1 : -1) : (sa < sb ? 1 : -1);
    const na = seqFromNumber(a.number), nb = seqFromNumber(b.number);
    if (na !== nb) return f.sort === "oldest" ? na - nb : nb - na;
    return 0;
  });
  return out;
}

export function totals(list: Receipt[]) {
  let sales = 0, paid = 0, outstanding = 0, paidN = 0, partN = 0, unpaidN = 0, n = 0;
  list.forEach((r) => {
    if (r.isDraft) return;
    n++;
    sales += Number(r.grand) || 0;
    paid += Number(r.paid) || 0;
    outstanding += Math.max(0, Number(r.balance) || 0);
    if (r.status === "PAID" || r.status === "PAID IN FULL") paidN++;
    else if (r.status === "PARTIALLY PAID") partN++;
    else unpaidN++;
  });
  return { count: n, sales, paid, outstanding, avg: n ? sales / n : 0, paidN, partN, unpaidN };
}

export function moneyMix(amount: number, list: Receipt[]) {
  const codes: Record<string, boolean> = {};
  list.forEach((r) => { codes[r.currency || "NGN"] = true; });
  const keys = Object.keys(codes);
  if (keys.length === 1) return money(amount, keys[0]);
  return money(amount, "NGN") + "*";
}

export function statusInfo(r: Receipt): { label: string; tone: "ok" | "warn" | "danger" | "neutral" } {
  if (r.voided) return { label: "Cancelled", tone: "neutral" };
  if (r.refunded) return { label: "Refunded", tone: "neutral" };
  const st = r.status === "PAID" ? "PAID IN FULL" : (r.status || "UNPAID");
  if (st === "PAID IN FULL") return { label: "Paid in Full", tone: "ok" };
  if (st === "PARTIALLY PAID") return { label: "Partially Paid", tone: "warn" };
  return { label: "Unpaid", tone: "danger" };
}
