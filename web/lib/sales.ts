import { compute, money as calcMoney } from "./calc";
import type { Receipt } from "./types";

// Faithful port of js/sales.js (pure parts). Same period rules, same totals,
// same product allocation and rounding, so the figures match the old page.

export function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}
export function iso(d: Date) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
export function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function normStatus(st?: string) { if (st === "PAID") return "PAID IN FULL"; return st || "UNPAID"; }

export interface Summary { count: number; sales: number; paid: number; outstanding: number; avg: number; nPaid: number; nPart: number; nUnpaid: number; refunded: number; nRefund: number }

export function summarize(list: Receipt[]): Summary {
  let sales = 0, paid = 0, nPaid = 0, nPart = 0, nUnpaid = 0, refunded = 0, nRefund = 0;
  list.forEach((r) => {
    if (r.voided) return;
    if (r.refunded) { refunded += Number(r.grand) || 0; nRefund++; return; }
    sales += Number(r.grand) || 0;
    paid += Number(r.paid) || 0;
    const st = normStatus(r.status);
    if (st === "PAID IN FULL") nPaid++;
    else if (st === "PARTIALLY PAID") nPart++;
    else nUnpaid++;
  });
  const live = list.filter((r) => !r.voided && !r.refunded);
  return { count: live.length, sales, paid, outstanding: Math.max(0, sales - paid), avg: live.length ? sales / live.length : 0, nPaid, nPart, nUnpaid, refunded, nRefund };
}

/** sales.js money(n, list): currency of the first receipt in the list. */
export function money(n: number, list: Receipt[]) {
  const cur = (list[0] && list[0].currency) || "NGN";
  return calcMoney(n, cur);
}

export function roundMoney(value: unknown) {
  let n = Number(value);
  if (!isFinite(n)) n = 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function productKey(name: unknown) { return String(name || "").trim(); }

export interface ProductLine { name: string; qty: number; sales: number; collected: number; outstanding: number }

export function allocateReceipt(receipt: Receipt): ProductLine[] {
  const calc = compute((receipt.items || []) as any, receipt.discount, receipt.taxPct, receipt.paid, receipt.shipping);
  const lines = (calc.items || []).filter((line) => productKey(line.name));
  const subtotal = roundMoney(calc.subtotal);
  const grand = roundMoney(receipt.grand != null ? receipt.grand : calc.grand);
  const paid = roundMoney(receipt.paid != null ? receipt.paid : calc.paid);
  if (!lines.length || subtotal <= 0) return [];
  let usedSales = 0, usedPaid = 0;
  return lines.map((line, index) => {
    const last = index === lines.length - 1;
    const sales = last ? roundMoney(grand - usedSales) : roundMoney(grand * (line.total / subtotal));
    const collected = last ? roundMoney(paid - usedPaid) : roundMoney(paid * (line.total / subtotal));
    usedSales = roundMoney(usedSales + sales);
    usedPaid = roundMoney(usedPaid + collected);
    return { name: productKey(line.name), qty: Number(line.qty) || 0, sales, collected, outstanding: roundMoney(sales - collected) };
  });
}

export function aggregateProducts(receipts: Receipt[], query: string): ProductLine[] {
  const needle = String(query || "").trim().toLowerCase();
  const map: Record<string, ProductLine> = {};
  (receipts || []).forEach((receipt) => {
    allocateReceipt(receipt).forEach((line) => {
      if (needle && line.name.toLowerCase().indexOf(needle) === -1) return;
      const row = map[line.name] || { name: line.name, qty: 0, sales: 0, collected: 0, outstanding: 0 };
      row.qty += line.qty;
      row.sales = roundMoney(row.sales + line.sales);
      row.collected = roundMoney(row.collected + line.collected);
      row.outstanding = roundMoney(row.outstanding + line.outstanding);
      map[line.name] = row;
    });
  });
  return Object.keys(map).sort((a, b) => a.localeCompare(b)).map((k) => map[k]);
}

export type View = "daily" | "weekly" | "monthly";
export type Preset = "today" | "yesterday" | "week" | "lastWeek" | "month" | "lastMonth" | "custom";
export interface PeriodInput { preset: Preset; view: View; day: string; from: string; to: string }

/** Same branch order as periodBounds() in sales.js. */
export function periodBounds(p: PeriodInput, today = new Date()) {
  let from = iso(today), to = iso(today);
  if (p.preset === "yesterday") { const y = addDays(today, -1); from = to = iso(y); }
  else if (p.preset === "week" || p.view === "weekly") { from = iso(startOfWeek(today)); to = iso(today); }
  else if (p.preset === "lastWeek") { const end = addDays(startOfWeek(today), -1); from = iso(startOfWeek(end)); to = iso(end); }
  else if (p.preset === "month" || p.view === "monthly") { from = iso(new Date(today.getFullYear(), today.getMonth(), 1)); to = iso(today); }
  else if (p.preset === "lastMonth") { from = iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)); to = iso(new Date(today.getFullYear(), today.getMonth(), 0)); }
  else if (p.preset === "custom") { from = p.from || from; to = p.to || to; }
  else if (p.view === "daily") { from = to = p.day || iso(today); }
  return { from, to };
}

export function dateKey(dateStr: unknown) {
  if (!dateStr) return "";
  const m = String(dateStr).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}
export function inRange(r: Receipt, from: string, to: string) {
  const key = dateKey(r && r.date);
  if (!key) return false;
  return key >= from && key <= to;
}

/** Receipts in a period, sorted like the old page (newest date, then number desc). */
export function periodList(all: Receipt[], from: string, to: string) {
  const list = all.filter((r) => !r.isDraft && inRange(r, from, to));
  list.sort((a, b) => {
    const da = a.date || "", db = b.date || "";
    if (da !== db) return da < db ? 1 : -1;
    return String(b.number || "").localeCompare(String(a.number || ""), undefined, { numeric: true });
  });
  return list;
}

export function productSource(list: Receipt[], payFilter: string) {
  let src = list.filter((r) => !r.voided && !r.refunded);
  if (payFilter !== "all") src = src.filter((r) => normStatus(r.status) === payFilter);
  return src;
}

export function productTotals(products: ProductLine[]) {
  return products.reduce((sum, row) => {
    sum.qty += row.qty;
    sum.sales = roundMoney(sum.sales + row.sales);
    sum.collected = roundMoney(sum.collected + row.collected);
    sum.outstanding = roundMoney(sum.outstanding + row.outstanding);
    return sum;
  }, { qty: 0, sales: 0, collected: 0, outstanding: 0 });
}

function csvEscape(value: unknown) {
  const s = String(value == null ? "" : value);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Same CSV as downloadProductCsv() in sales.js (note: totals summed without per-step rounding). */
export function productCsv(products: ProductLine[]) {
  const lines = ["Product,Quantity sold,Sales value,Amount collected,Outstanding"];
  products.forEach((row) => lines.push([row.name, row.qty, row.sales, row.collected, row.outstanding].map(csvEscape).join(",")));
  const t = products.reduce((sum, row) => { sum.qty += row.qty; sum.sales += row.sales; sum.collected += row.collected; sum.outstanding += row.outstanding; return sum; }, { qty: 0, sales: 0, collected: 0, outstanding: 0 });
  lines.push("");
  lines.push(["Total", t.qty, roundMoney(t.sales), roundMoney(t.collected), roundMoney(t.outstanding)].map(csvEscape).join(","));
  return lines.join("\n");
}

export function statusText(st: string) {
  return st === "PAID IN FULL" ? "Fully Paid" : st === "PARTIALLY PAID" ? "Partially Paid" : "Unpaid";
}
