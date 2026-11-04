import { compute } from "@/lib/calc";
import { readPhone, splitStored } from "@/lib/phone";
import { timeZone } from "@/lib/val";
import type { Business, Receipt } from "@/lib/types";

// Form model for the generator. Mirrors the inputs of index.html.
export interface ItemField { key: number; name: string; qty: string; price: string }
export interface FormState {
  number: string; date: string; time: string; payment: string; currency: string; notes: string;
  discount: string; taxPct: string; shipping: string; paid: string; status: string;
  items: ItemField[];
  custName: string; custPhone: string; custIso: string; custEmail: string;
  bizName: string; bizAddress: string; bizPhone: string; bizIso: string; bizEmail: string; bizWebsite: string;
  bizFooter: string; prefix: string; taxDefault: string; logo: string; template: string;
}

let itemKey = 0;
export function newItem(it?: { name?: unknown; qty?: unknown; price?: unknown }): ItemField {
  return {
    key: ++itemKey,
    name: String((it && it.name) || ""),
    qty: it && it.qty != null ? String(it.qty) : "1",
    price: it && it.price != null ? String(it.price) : "0",
  };
}

export function emptyForm(): FormState {
  return {
    number: "", date: "", time: "", payment: "Cash", currency: "NGN", notes: "",
    discount: "", taxPct: "", shipping: "0", paid: "0", status: "UNPAID",
    items: [newItem()],
    custName: "", custPhone: "", custIso: "", custEmail: "",
    bizName: "", bizAddress: "", bizPhone: "", bizIso: "", bizEmail: "", bizWebsite: "",
    bizFooter: "", prefix: "RCT-", taxDefault: "", logo: "", template: "classic",
  };
}

/** applyPaymentRules(): Paid in Full locks Amount Paid to the total, Unpaid to 0. */
export function lockedPaid(f: FormState): string | null {
  const calc = compute(f.items, f.discount, f.taxPct, 0, f.shipping);
  if (f.status === "PAID IN FULL" || f.status === "PAID") return String(calc.grand);
  if (f.status === "UNPAID") return "0";
  return null;
}

export function effectivePaid(f: FormState): string {
  const l = lockedPaid(f);
  return l == null ? f.paid : l;
}

/** readForm() from app.js. */
export function readForm(f: FormState): Partial<Receipt> {
  const calc = compute(f.items, f.discount, f.taxPct, effectivePaid(f), f.shipping);
  const bp = readPhone(f.bizPhone, f.bizIso);
  const cp = readPhone(f.custPhone, f.custIso);
  return {
    number: f.number.trim(),
    date: f.date,
    time: f.time,
    payment: f.payment,
    currency: f.currency,
    notes: f.notes,
    template: f.template,
    business: { name: f.bizName, address: f.bizAddress, phone: bp.phone, phoneCountry: bp.country, email: f.bizEmail, website: f.bizWebsite, logo: f.logo, footer: f.bizFooter || "" },
    customer: { name: f.custName, phone: cp.phone, phoneCountry: cp.country, email: f.custEmail },
    items: calc.items,
    subtotal: calc.subtotal, discount: calc.discount, taxPct: calc.taxPct, tax: calc.tax, shipping: calc.shipping,
    grand: calc.grand, paid: calc.paid, balance: calc.balance,
    status: f.status || "UNPAID",
    timezone: timeZone(),
  };
}

export function statusMessage(data: Partial<Receipt>) {
  if (data.status === "PARTIALLY PAID") {
    const paid = Number(data.paid) || 0;
    const grand = Number(data.grand) || 0;
    if (!(paid > 0)) return "Enter an amount greater than 0 for a partially paid receipt.";
    if (paid + 0.0001 >= grand) return "For a partially paid receipt, Amount Paid must be less than the Grand Total.";
  }
  return "";
}

/** fillBusiness() */
export function withBusiness(f: FormState, biz: Partial<Business> | null, suggest: (cur?: string) => string): FormState {
  if (!biz) return f;
  const next = { ...f };
  next.bizName = biz.name || "";
  next.bizAddress = biz.address || "";
  const ph = splitStored(biz.phone || "", biz.phoneCountry || "", f.bizIso);
  next.bizPhone = ph.value; next.bizIso = ph.iso;
  if (!biz.phone && !biz.phoneCountry && !next.bizIso) next.bizIso = suggest(biz.currency || f.currency);
  next.bizEmail = biz.email || "";
  next.bizWebsite = biz.website || "";
  next.prefix = biz.prefix || "RCT-";
  next.bizFooter = biz.footer || "";
  next.taxDefault = biz.taxPct != null ? String(biz.taxPct) : "";
  next.logo = biz.logo || "";
  if (biz.currency) next.currency = biz.currency;
  if (biz.template) next.template = biz.template;
  if (biz.taxPct != null && !next.taxPct) next.taxPct = String(biz.taxPct);
  return next;
}

/** fillRecord() */
export function withRecord(f: FormState, rec: Receipt, suggest: (cur?: string) => string): FormState {
  let next = withBusiness(f, rec.business || null, suggest);
  const cust = rec.customer || {};
  const cp = splitStored(cust.phone || "", cust.phoneCountry || "", next.custIso);
  let st = rec.status || "UNPAID";
  if (st === "PAID") st = "PAID IN FULL";
  next = {
    ...next,
    custName: cust.name || "", custPhone: cp.value, custIso: cp.iso, custEmail: cust.email || "",
    number: rec.number || "", date: rec.date || "", time: rec.time || "",
    payment: rec.payment || "Cash", currency: rec.currency || "NGN", notes: rec.notes || "",
    discount: rec.discount ? String(rec.discount) : "", taxPct: rec.taxPct ? String(rec.taxPct) : "",
    shipping: rec.shipping ? String(rec.shipping) : "", paid: rec.paid ? String(rec.paid) : "",
    status: st, logo: (rec.business && rec.business.logo) || "", template: rec.template || "classic",
    items: (rec.items && rec.items.length ? rec.items : [{ name: "", qty: 1, price: 0 }]).map((it) => newItem(it)),
  };
  return next;
}

export function isDirty(f: FormState) {
  return !!(f.custName.trim() || f.notes.trim() || f.items.some((it) => it.name.trim()));
}
