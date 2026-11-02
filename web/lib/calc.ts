// Port of js/calculations.js (logic unchanged).
export const CURRENCY: Record<string, { symbol: string; label: string }> = {
  NGN: { symbol: "₦", label: "NGN" },
  USD: { symbol: "$", label: "US Dollar" },
  GBP: { symbol: "£", label: "British Pound" },
  EUR: { symbol: "€", label: "Euro" },
  GHS: { symbol: "GH₵", label: "Ghanaian Cedi" },
  KES: { symbol: "KSh", label: "Kenyan Shilling" },
};

export const CURRENCY_OPTIONS = [
  { value: "NGN", label: "₦ NGN" },
  { value: "USD", label: "$ US Dollar" },
  { value: "GBP", label: "£ British Pound" },
  { value: "EUR", label: "€ Euro" },
  { value: "GHS", label: "GH₵ Ghana Cedi" },
  { value: "KES", label: "KSh Kenya Shilling" },
];

export function num(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function roundMoney(value: unknown): number {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

export function money(n: unknown, code?: string): string {
  const c = (code && CURRENCY[code]) || CURRENCY.NGN;
  const val = num(n);
  const formatted = Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (val < 0 ? "-" : "") + c.symbol + formatted;
}

export interface ItemInput { name: string; qty: unknown; price: unknown }
export interface ItemRow { name: string; qty: number; price: number; total: number }
export interface Computed {
  items: ItemRow[]; subtotal: number; discount: number; taxPct: number; tax: number;
  shipping: number; grand: number; paid: number; balance: number; status: string;
}

export function compute(items: ItemInput[], discount: unknown, taxPct: unknown, paid: unknown, shipping: unknown): Computed {
  const rows = (items || []).map((it) => {
    const qty = Math.max(0, num(it.qty));
    const price = Math.max(0, num(it.price));
    return { name: it.name || "", qty, price, total: roundMoney(qty * price) };
  });
  const subtotal = roundMoney(rows.reduce((s, it) => s + it.total, 0));
  let disc = Math.max(0, roundMoney(discount));
  if (disc > subtotal) disc = subtotal;
  const after = roundMoney(subtotal - disc);
  const pct = Math.max(0, num(taxPct));
  const tax = roundMoney(after * (pct / 100));
  const ship = Math.max(0, roundMoney(shipping));
  const grand = roundMoney(after + tax + ship);
  const amountPaid = Math.max(0, roundMoney(paid));
  const balance = Math.max(0, roundMoney(grand - amountPaid));
  let status = "UNPAID";
  if (grand <= 0 && amountPaid <= 0) status = "UNPAID";
  else if (amountPaid + 0.0001 >= grand) status = "PAID";
  else if (amountPaid > 0) status = "PARTIALLY PAID";
  return { items: rows, subtotal, discount: disc, taxPct: pct, tax, shipping: ship, grand, paid: amountPaid, balance, status };
}
