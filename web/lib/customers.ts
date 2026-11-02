import { money } from "./calc";
import { sanitize as s } from "./val";
import type { Business, Receipt } from "./types";

// Port of the inline script in customers.html (same grouping and totals).

export interface CustomerRow { key: string; name: string; phone: string; phoneCountry: string; email: string; count: number; purchases: number; outstanding: number; paid: number; lastDate: string; currency: string }

export function customerList(rows: Receipt[]): CustomerRow[] {
  const map: Record<string, CustomerRow> = {};
  rows.forEach((r) => {
    if (r.isDraft || r.voided) return;
    const c: any = r.customer || {};
    const name = String(c.name || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!map[key]) map[key] = { key, name, phone: c.phone || "", phoneCountry: c.phoneCountry || "", email: c.email || "", count: 0, purchases: 0, outstanding: 0, paid: 0, lastDate: "", currency: r.currency || "NGN" };
    const row = map[key];
    if (!row.phone && c.phone) row.phone = c.phone;
    if (!row.phoneCountry && c.phoneCountry) row.phoneCountry = c.phoneCountry;
    if (!row.email && c.email) row.email = c.email;
    row.count += 1;
    const day = String(r.date || "").match(/^(\d{4}-\d{2}-\d{2})/);
    if (day && day[1] > row.lastDate) row.lastDate = day[1];
    if (!r.refunded) {
      row.purchases += Number(r.grand) || 0;
      row.outstanding += Math.max(0, Number(r.balance) || 0);
      row.paid += Number(r.paid) || 0;
    }
  });
  const list = Object.keys(map).map((k) => map[k]);
  list.sort((a, b) => b.outstanding - a.outstanding);
  return list;
}

export function searchCustomers(list: CustomerRow[], raw: string) {
  const q = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return list;
  return list.filter((c) => [c.name, c.phone, c.email].join(" ").toLowerCase().indexOf(q) !== -1);
}

export interface Group { name: string; phone: string; phoneCountry: string; email: string; count: number; purchases: number; paid: number; outstanding: number; currency: string; receipts: Receipt[] }

export function buildGroup(rows: Receipt[], key: string): Group {
  const group: Group = { name: "", phone: "", phoneCountry: "", email: "", count: 0, purchases: 0, paid: 0, outstanding: 0, currency: "NGN", receipts: [] };
  (rows || []).forEach((r) => {
    if (r.isDraft || r.voided) return;
    const c: any = r.customer || {};
    const name = String(c.name || "").trim();
    if (!name || name.toLowerCase() !== key) return;
    if (!group.name) group.name = name;
    if (!group.phone && c.phone) group.phone = c.phone;
    if (!group.phoneCountry && c.phoneCountry) group.phoneCountry = c.phoneCountry;
    if (!group.email && c.email) group.email = c.email;
    group.currency = r.currency || group.currency;
    group.count += 1;
    group.receipts.push(r);
    if (!r.refunded) {
      group.purchases += Number(r.grand) || 0;
      group.paid += Number(r.paid) || 0;
      group.outstanding += Math.max(0, Number(r.balance) || 0);
    }
  });
  group.receipts.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return group;
}

export function safeLogo(raw: unknown) {
  const v = String(raw || "");
  return /^data:image\//i.test(v) || /^https:\/\//i.test(v) ? v : "";
}
export function itemSummary(r: Receipt) {
  return ((r && r.items) || []).map((it: any) => (it.qty == null ? 1 : it.qty) + " × " + (it.name || "Item")).filter(Boolean).join(", ") || "—";
}
export function statusLabel(st?: string) { if (st === "PAID") return "PAID IN FULL"; return st || "UNPAID"; }
export function fileStem(name: string) { return "customer-record-" + String(name || "customer").replace(/[^\w.-]+/g, "_"); }

export function summaryText(g: Group) {
  return g.name + (g.phone ? " · " + g.phone : "") + " · Receipts " + g.count + " · Purchases " + money(g.purchases, g.currency) + " · Outstanding " + money(g.outstanding, g.currency);
}

/** Same document markup as renderDoc() in customers.html. */
export function renderDoc(group: Group, biz: Partial<Business>) {
  biz = biz || {};
  const logoSrc = safeLogo(biz.logo);
  const logoHtml = logoSrc ? '<div class="logo-wrap"><img alt="' + s(biz.name || "Business logo") + '" src="' + s(logoSrc) + '"></div>' : "";
  const contact = [biz.address, biz.phone, biz.email, biz.website].filter(Boolean).map(s).join(" · ");
  const cur = group.currency || "NGN";
  const m = (n: unknown) => money(n, cur);
  const rows = group.receipts.map((r) => "<tr><td>" + s(r.date || "") + "</td><td>" + s(r.number || "") + "</td><td>" + s(itemSummary(r)) + "</td><td>" + m(r.grand) + "</td><td>" + m(r.paid) + "</td><td>" + m(r.balance) + "</td><td>" + s(statusLabel(r.status)) + "</td></tr>").join("");
  return logoHtml +
    "<h2>" + s(biz.name || "Business") + "</h2>" +
    (contact ? '<p class="cust-record-contact">' + contact + "</p>" : "") +
    "<h3>Customer Record</h3>" +
    "<p><strong>Customer:</strong> " + s(group.name) + "</p>" +
    (group.phone ? "<p><strong>Phone:</strong> " + s(group.phone) + "</p>" : "") +
    (group.email ? "<p><strong>Email:</strong> " + s(group.email) + "</p>" : "") +
    '<div class="cust-record-summary"><p><strong>Receipts:</strong> ' + group.count +
    "</p><p><strong>Purchases:</strong> " + m(group.purchases) +
    "</p><p><strong>Paid:</strong> " + m(group.paid) +
    "</p><p><strong>Outstanding:</strong> " + m(group.outstanding) + "</p></div>" +
    "<h3>Transaction History</h3>" +
    '<div class="table-scroll"><table class="records-table cust-record-table"><thead><tr>' +
    "<th>Date</th><th>Receipt</th><th>Items</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th>" +
    "</tr></thead><tbody>" + (rows || "<tr><td colspan='7'>No receipts.</td></tr>") +
    "</tbody></table></div>" +
    '<p class="hint">Generated by Receipt Pilot</p>';
}
