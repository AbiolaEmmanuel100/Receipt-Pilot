import { money } from "./calc";
import type { Receipt } from "./types";

/*
 * Payment history for receipts that still have an outstanding balance.
 *
 * Nothing new is needed in the database: the whole receipt object is already
 * stored in the `payload` JSON column of `receipts` (see lib/sync.ts toRow /
 * fromRow), and the summary columns (amount_paid, outstanding, payment_status)
 * are kept in step from `paid`, `balance` and `status` as before.
 *
 * Extra fields on the receipt object (all optional, so older receipts are
 * untouched until a payment is recorded on them):
 *   payments        PaymentEntry[]  payments recorded after the receipt was issued
 *   paidAtIssue     number          amount already paid when the receipt was issued
 *                                   (captured from `paid` the first time a payment is recorded)
 *   paidInFullOn    string          YYYY-MM-DD of the payment that cleared the balance
 *   undonePayments  PaymentEntry[]  payments removed with "Undo last payment" (kept for the audit trail)
 */
export interface PaymentEntry {
  id: string;
  amount: number;
  date: string;      // YYYY-MM-DD the money was received
  method?: string;
  note?: string;
  at: string;        // ISO time it was recorded
  undoneAt?: string;
}

export const MAX_NOTE = 120;

const cents = (v: unknown) => Math.round((Number(v) || 0) * 100);
const fromCents = (c: number) => Math.round(c) / 100;

export function paymentsOf(r: Partial<Receipt> | null | undefined): PaymentEntry[] {
  const list = r && Array.isArray(r.payments) ? (r.payments as PaymentEntry[]) : [];
  return list.filter((p) => p && cents(p.amount) > 0);
}

export function hasPaymentHistory(r: Partial<Receipt> | null | undefined) {
  return paymentsOf(r).length > 0;
}

/** Amount paid when the receipt was issued (before any recorded payments). */
export function issuePaid(r: Partial<Receipt>): number {
  if (hasPaymentHistory(r) && r.paidAtIssue != null) return fromCents(Math.max(0, cents(r.paidAtIssue)));
  if (hasPaymentHistory(r)) return fromCents(Math.max(0, cents(r.paid) - paymentsOf(r).reduce((s, p) => s + cents(p.amount), 0)));
  return fromCents(Math.max(0, cents(r.paid)));
}

export function outstanding(r: Partial<Receipt>): number {
  return fromCents(Math.max(0, cents(r.grand) - cents(r.paid)));
}

function normStatus(st?: string) { return st === "PAID" ? "PAID IN FULL" : (st || "UNPAID"); }

/** A receipt still owes money (and is a live, saved receipt). */
export function isOwing(r: Partial<Receipt> | null | undefined): boolean {
  if (!r || r.isDraft || r.voided || r.refunded || r.deletedAt) return false;
  if (!(cents(r.grand) > 0)) return false;
  const st = normStatus(r.status);
  if (st === "PAID IN FULL") return false;
  return cents(r.grand) - cents(r.paid) > 0;
}

/** Record payment is offered for live receipts that still owe money. */
export const canRecordPayment = isOwing;

/**
 * Payment status and the amount-paid figure can no longer be edited freely on
 * a receipt that owes money or already has recorded payments; they change only
 * through Record payment / Undo last payment.
 */
export function paymentLocked(r: Partial<Receipt> | null | undefined): boolean {
  if (!r || r.isDraft) return false;
  return hasPaymentHistory(r) || isOwing(r);
}

/** Once payments are recorded the money figures (items, discount, tax, delivery, currency) are fixed too. */
export function amountsLocked(r: Partial<Receipt> | null | undefined): boolean {
  return !!r && !r.isDraft && hasPaymentHistory(r);
}

function statusFor(grandC: number, paidC: number) {
  if (grandC > 0 && paidC >= grandC) return "PAID IN FULL";
  if (paidC > 0) return "PARTIALLY PAID";
  return "UNPAID";
}

export function todayIso(now = new Date()) {
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
}

function validDate(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

function receiptDay(r: Partial<Receipt>) {
  const s = String(r.date || "");
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : "";
}

/** Parses a typed amount ("5000", "5,000.50"). Returns NaN when it is not a plain money amount. */
export function parseAmount(input: unknown): number {
  const s = String(input == null ? "" : input).trim().replace(/[,\s]/g, "").replace(/^[₦$£€]/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Number(s);
}

export interface PaymentInput { amount: unknown; date?: string; method?: string; note?: string }

/** Returns an error message, or "" when the payment can be recorded. */
export function validatePayment(r: Partial<Receipt>, input: PaymentInput, now = new Date()): string {
  if (!canRecordPayment(r)) {
    if (r && (r.voided || r.refunded)) return "Payments can't be added to a cancelled or refunded receipt.";
    if (r && r.isDraft) return "Save this receipt before recording a payment.";
    return "This receipt has no balance left to pay.";
  }
  const amt = parseAmount(input.amount);
  if (!isFinite(amt)) return "Enter the amount received, like 5000 or 5000.50.";
  if (!(cents(amt) > 0)) return "Enter an amount greater than 0.";
  const bal = cents(r.grand) - cents(r.paid);
  if (cents(amt) > bal) return "That's more than the balance of " + money(fromCents(bal), r.currency || "NGN") + ". Enter " + money(fromCents(bal), r.currency || "NGN") + " or less.";
  const date = String(input.date || "");
  if (!validDate(date)) return "Choose the date the payment was received.";
  if (date > todayIso(now)) return "The payment date can't be in the future.";
  const day = receiptDay(r);
  if (day && date < day) return "The payment date can't be before the receipt date (" + day + ").";
  if (String(input.note || "").length > MAX_NOTE) return "Keep the note under " + MAX_NOTE + " characters.";
  return "";
}

function pid() {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return "pay_" + crypto.randomUUID(); } catch { /* fall back */ }
  return "pay_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Returns a new receipt with the payment appended. Throws Error(message) when invalid. */
export function recordPayment(r: Receipt, input: PaymentInput, now = new Date()): Receipt {
  const err = validatePayment(r, input, now);
  if (err) throw new Error(err);
  const at = now.toISOString();
  const amount = fromCents(cents(parseAmount(input.amount)));
  const list = paymentsOf(r);
  const base = list.length ? issuePaid(r) : fromCents(Math.max(0, cents(r.paid)));
  const entry: PaymentEntry = { id: pid(), amount, date: String(input.date), at };
  const method = String(input.method || "").trim();
  const note = String(input.note || "").trim().slice(0, MAX_NOTE);
  if (method) entry.method = method;
  if (note) entry.note = note;
  const payments = list.concat([entry]);
  const grandC = cents(r.grand);
  const paidC = cents(base) + payments.reduce((s, p) => s + cents(p.amount), 0);
  const next: Receipt = {
    ...r,
    payments, paidAtIssue: base,
    paid: fromCents(paidC), balance: fromCents(Math.max(0, grandC - paidC)), status: statusFor(grandC, paidC),
    updatedAt: at, syncStatus: "pending",
    versions: (r.versions || []).concat([{ at, action: "payment recorded " + money(amount, r.currency || "NGN") }]).slice(-50),
  };
  if (next.status === "PAID IN FULL") next.paidInFullOn = entry.date; else delete next.paidInFullOn;
  return next;
}

/** Returns a new receipt with the most recent payment removed (it is kept in undonePayments). */
export function undoLastPayment(r: Receipt, now = new Date()): Receipt {
  const list = paymentsOf(r);
  if (!list.length) throw new Error("There is no recorded payment to undo.");
  if (r.voided || r.refunded) throw new Error("Payments can't be changed on a cancelled or refunded receipt.");
  const at = now.toISOString();
  const base = issuePaid(r);
  const last = list[list.length - 1];
  const payments = list.slice(0, -1);
  const grandC = cents(r.grand);
  const paidC = cents(base) + payments.reduce((s, p) => s + cents(p.amount), 0);
  const undone = (Array.isArray(r.undonePayments) ? r.undonePayments : []).concat([{ ...last, undoneAt: at }]);
  const next: Receipt = {
    ...r,
    payments, paidAtIssue: base, undonePayments: undone,
    paid: fromCents(paidC), balance: fromCents(Math.max(0, grandC - paidC)), status: statusFor(grandC, paidC),
    updatedAt: at, syncStatus: "pending",
    versions: (r.versions || []).concat([{ at, action: "payment undone " + money(last.amount, r.currency || "NGN") }]).slice(-50),
  };
  delete next.paidInFullOn;
  if (next.status === "PAID IN FULL") next.paidInFullOn = payments.length ? payments[payments.length - 1].date : undefined;
  if (next.paidInFullOn === undefined) delete next.paidInFullOn;
  return next;
}

const MONEY_FIELDS = ["items", "subtotal", "discount", "taxPct", "tax", "shipping", "grand", "currency"] as const;

/**
 * Applied when an existing receipt is saved from the editor. Keeps the payment
 * fields (and, once payments are recorded, the money fields) exactly as they
 * were, so an edit can't silently rewrite what was paid.
 */
export function applyEditLock(prev: Receipt | null | undefined, d: Partial<Receipt>): Partial<Receipt> {
  if (!prev || !paymentLocked(prev)) return d;
  const out: Partial<Receipt> = { ...d };
  if (amountsLocked(prev)) MONEY_FIELDS.forEach((k) => { (out as Record<string, unknown>)[k] = (prev as Record<string, unknown>)[k]; });
  const grandC = cents(out.grand);
  const paidC = cents(prev.paid);
  out.paid = fromCents(paidC);
  out.balance = fromCents(Math.max(0, grandC - paidC));
  out.status = statusFor(grandC, paidC);
  return out;
}

/** Message shown when an edit would make the total smaller than what was already paid. */
export function editLockError(prev: Receipt | null | undefined, d: Partial<Receipt>): string {
  if (!prev || !paymentLocked(prev) || amountsLocked(prev)) return "";
  const paidC = cents(prev.paid);
  if (paidC > 0 && cents(d.grand) <= paidC) {
    return "The new total must stay above the " + money(fromCents(paidC), d.currency || prev.currency || "NGN") + " already paid. To mark it paid, use Record payment in Receipt history.";
  }
  return "";
}
