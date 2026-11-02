/* eslint-disable @typescript-eslint/no-explicit-any */
import { ready as cloudReady } from "./cloud";
import { userId } from "./session";
import { refreshEntitlement } from "./account";
import { toast } from "./bus";

// Faithful port of js/billing.js. Same Worker endpoints, same Bearer token
// from Supabase, same request bodies (plan_code + renewal_mode "manual" only;
// amounts are never sent or trusted), same localStorage key for the pending
// Paystack reference, and the same handling of every verify result.

export type { Plan } from "./plans";
export { FALLBACK_PLANS, plansFrom, fetchPlans, worker } from "./plans";
import { worker } from "./plans";

export const PENDING_KEY = "receiptly_pending_payment_ref";
const PENDING_MAX_AGE = 30 * 86400000;
// Paystack reference charset: alphanumerics plus - . = (same rule as the Worker).
const REFERENCE_PATTERN = /^[A-Za-z0-9.=-]{6,100}$/;
const verifying: Record<string, Promise<VerifyOutcome>> = {};
const autoTried: Record<string, boolean> = {};

export type VerifyOutcome = "applied" | "signed_out" | "pending" | "held" | "review" | "cleared" | "retry";

export function validReference(ref: unknown) { return REFERENCE_PATTERN.test(String(ref || "")); }

/** Paystack appends ?trxref=...&reference=... to callback_url. */
export function referenceFromUrl(): string {
  const q = new URLSearchParams(location.search);
  const ref = String(q.get("reference") || q.get("trxref") || "").trim();
  return validReference(ref) ? ref : "";
}

interface PendingRec { ref: string; savedAt: number; holdFor?: string; review?: boolean }

// Only the reference is stored. Amount, plan and owner always come from
// Paystack and the server, never from this record.
export function readPending(): PendingRec | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    let rec: any = null;
    try { rec = JSON.parse(raw); } catch { rec = { ref: raw, savedAt: Date.now() }; }
    if (!rec || !validReference(rec.ref) || !(Number(rec.savedAt) > 0) || Date.now() - Number(rec.savedAt) > PENDING_MAX_AGE) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return rec;
  } catch { return null; }
}

export function pendingReference() { const rec = readPending(); return rec ? rec.ref : ""; }

export function rememberReference(ref: string, extra?: Partial<PendingRec>) {
  if (!validReference(ref)) return;
  try {
    const old = readPending();
    const rec: PendingRec = { ref, savedAt: old && old.ref === ref ? old.savedAt : Date.now() };
    if (old && old.ref === ref) {
      if (old.holdFor) rec.holdFor = old.holdFor;
      if (old.review) rec.review = true;
    }
    if (extra) Object.assign(rec, extra);
    localStorage.setItem(PENDING_KEY, JSON.stringify(rec));
  } catch { /* storage optional */ }
}

function forgetReference(ref: string) {
  try {
    const rec = readPending();
    if (!rec || !ref || rec.ref === ref) localStorage.removeItem(PENDING_KEY);
  } catch { /* storage optional */ }
}

function refreshAccount() { return Promise.resolve(refreshEntitlement()).catch(() => {}); }


export function money(naira: number) { return "₦" + Number(naira || 0).toLocaleString(); }

async function session(): Promise<{ token: string; userId: string } | null> {
  try {
    const sb: any = await cloudReady();
    if (!sb) return null;
    const res = await sb.auth.getSession();
    const s = res && res.data && res.data.session;
    if (!s || !s.access_token) return null;
    return { token: s.access_token, userId: (s.user && s.user.id) || "" };
  } catch { return null; }
}

export async function token() { const s = await session(); return s ? s.token : ""; }

export function trialEndFrom(data: any) { return data ? data.trial_ends_at || data.trialEndsAt || "" : ""; }

export function formatTrialDate(value: any) {
  const date = new Date(value);
  if (!value || isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

// Page "elements" -----------------------------------------------------------
export interface BillingSink {
  setVerify(text: string): void;
  setError(text: string): void;
  setSignIn(on: boolean, label: string): void;
  setStatus(text: string, data?: any): void;
}
let pageSink: BillingSink | null = null;
export function registerPage(sink: BillingSink | null) { pageSink = sink; }
export function onBillingPage() { return !!pageSink; }

function showSignInLink(on: boolean) {
  if (!pageSink) return;
  // Only mention "finish activating" when a payment reference is waiting.
  pageSink.setSignIn(on, (referenceFromUrl() || pendingReference()) ? "Sign in to finish activating your payment" : "Sign in to see your plan");
}

/**
 * Asks the Worker to verify a reference with Paystack. Never creates a payment.
 * Safe to repeat: the database applies a reference only once. The stored
 * reference is cleared only after a definitive server answer.
 */
export async function verifyReference(reference: string, opts: { statusEl?: (t: string) => void; errorEl?: (t: string) => void } = {}): Promise<VerifyOutcome> {
  const setStatus = opts.statusEl || (() => {});
  const setError = opts.errorEl || (() => {});
  if (!validReference(reference)) return "cleared";
  if (reference in verifying) return verifying[reference];
  verifying[reference] = (async (): Promise<VerifyOutcome> => {
    const base = worker();
    const s = await session();
    if (!base || !s) {
      setStatus("Sign in to finish activating your payment (reference " + reference + "). The reference is saved on this device, so you do not need to pay again.");
      showSignInLink(true);
      return "signed_out";
    }
    showSignInLink(false);
    setError("");
    setStatus("Checking payment " + reference + " with Paystack...");
    let res: Response;
    let data: any;
    try {
      res = await fetch(base + "/api/billing/verify", {
        method: "POST",
        headers: { Authorization: "Bearer " + s.token, "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      setStatus("Payment " + reference + " is not activated yet.");
      setError("Could not reach the billing service. Check your connection and use Refresh access.");
      return "retry";
    }
    const result = data.result || "";
    if (res.ok && (result === "processed" || result === "already_processed")) {
      forgetReference(reference);
      setStatus("Payment " + reference + " verified. Your subscription is active.");
      await refreshAccount();
      return "applied";
    }
    const message = data.error || "Payment could not be verified.";
    if (res.status === 401) {
      setStatus("Sign in to finish activating your payment (reference " + reference + ").");
      showSignInLink(true);
      return "signed_out";
    }
    if (res.status === 400 || res.status === 404 || res.status === 422 ||
        (res.status === 402 && /failed|abandoned|reversed/i.test(String(data.paystack_status || "")))) {
      forgetReference(reference);
      setStatus("Payment " + reference + " was not activated.");
      setError(message);
      return "cleared";
    }
    if (res.status === 402) {
      setStatus("Payment " + reference + " is not confirmed by Paystack yet. Bank transfers can take a few minutes. Use Refresh access shortly.");
      setError(message);
      return "pending";
    }
    if (res.status === 403) {
      // Kept for the account that owns it; not retried automatically here.
      rememberReference(reference, { holdFor: s.userId });
      setStatus("Payment " + reference + " was not activated for this account.");
      setError(message);
      return "held";
    }
    if (res.status === 409) {
      rememberReference(reference, { review: true });
      setStatus("Payment " + reference + " needs a manual review before it can be activated. Do not pay again.");
      setError(message);
      return "review";
    }
    setStatus("Payment " + reference + " is not activated yet.");
    setError(message);
    return "retry";
  })();
  try { return await verifying[reference]; } finally { delete verifying[reference]; }
}

/** billing page: verify a returned/stored reference first, then load status. */
export async function resumePage() {
  const ref = referenceFromUrl() || pendingReference();
  if (ref && pageSink) {
    const sink = pageSink;
    await verifyReference(ref, { statusEl: (t) => sink.setVerify(t), errorEl: (t) => sink.setError(t) });
  }
  await loadPageStatus();
}

/** The status sentence shown on the billing page for a /api/billing/status response. */
export function describeStatus(data: any): string {
  const trial = formatTrialDate(trialEndFrom(data));
  const sub = data.subscription || {};
  const active = sub.status === "active" && sub.expires_at && Date.now() < new Date(sub.expires_at).getTime();
  return active
    ? "Subscription active" + (sub.plan_code ? " (" + String(sub.plan_code).replace("_", " ") + ")" : "") + ", paid through " + formatTrialDate(sub.expires_at) + "."
    : trial
      ? "Trial ends " + trial + ". Subscription: " + (sub.status || "trial") + (sub.expires_at ? ", paid through " + formatTrialDate(sub.expires_at) : "") + "."
      : "Trial end date is not available for this account. Subscription: " + (sub.status || "trial") + ".";
}

/**
 * Read-only GET /api/billing/status (same request as the billing page) for the
 * dashboard. Never verifies, never creates a payment.
 */
export async function fetchStatus(): Promise<{ text: string; data: any; active: boolean } | { error: string } | null> {
  const access = await token();
  if (!access) return null;
  const base = worker();
  if (!base) return { error: "Billing is not connected yet. The payment Worker URL is missing." };
  try {
    const res = await fetch(base + "/api/billing/status", { headers: { Authorization: "Bearer " + access } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not load status.");
    const sub = data.subscription || {};
    const active = !!(sub.status === "active" && sub.expires_at && Date.now() < new Date(sub.expires_at).getTime());
    return { text: describeStatus(data), data, active };
  } catch (e: any) {
    return { error: ((e && e.message) || "Could not load subscription status.") };
  }
}

export async function loadPageStatus() {
  const sink = pageSink;
  if (!sink) return;
  const access = await token();
  if (!access) {
    sink.setStatus("Sign in from the receipt generator to see your trial and subscription.");
    showSignInLink(true);
    return;
  }
  const base = worker();
  if (!base) { sink.setStatus("Billing is not connected yet. The payment Worker URL is missing."); return; }
  try {
    const res = await fetch(base + "/api/billing/status", { headers: { Authorization: "Bearer " + access } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not load status.");
    sink.setStatus(describeStatus(data), data);
  } catch (e: any) {
    sink.setStatus(((e && e.message) || "Could not load subscription status.") + " Use Refresh access to try again.");
  }
}

/** Billing page form submit (checkout). Never sends an amount. */
export async function pageCheckout(planCode: string, setError: (t: string) => void) {
  setError("");
  const base = worker();
  if (!base) { setError("Billing Worker is not configured."); return; }
  const access = await token();
  if (!access) { setError("Sign in before paying."); showSignInLink(true); return; }
  try {
    const res = await fetch(base + "/api/billing/checkout", {
      method: "POST",
      headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
      body: JSON.stringify({ plan_code: planCode || "monthly", renewal_mode: "manual" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.authorization_url) { setError(data.error || "Checkout could not be started."); return; }
    rememberReference(data.reference);
    location.href = data.authorization_url;
  } catch {
    setError("Checkout could not be started. Check your connection.");
  }
}

/**
 * Re-checks entitlement without creating a payment: verifies the returned or
 * stored Paystack reference (if any), then reloads status.
 */
export async function refreshAccess(): Promise<VerifyOutcome | "none"> {
  const sink = pageSink;
  const statusEl = sink ? (t: string) => sink.setVerify(t) : undefined;
  const errorEl = sink ? (t: string) => sink.setError(t) : undefined;
  if (errorEl) errorEl("");
  const ref = referenceFromUrl() || pendingReference();
  let outcome: VerifyOutcome | "none" = ref ? await verifyReference(ref, { statusEl, errorEl }) : "none";
  if (!ref && !(await token())) {
    if (statusEl) statusEl("Sign in before refreshing access.");
    showSignInLink(true);
    outcome = "signed_out";
  }
  if (sink) await loadPageStatus();
  if (outcome !== "applied") await refreshAccount();
  return outcome;
}

/** Other pages: once signed in, finish a stored payment automatically. */
export async function autoResume() {
  if (pageSink) return;
  const uid = userId();
  if (!uid) return;
  const rec = readPending();
  if (!rec || autoTried[rec.ref] || rec.review || rec.holdFor === uid) return;
  autoTried[rec.ref] = true;
  const outcome = await verifyReference(rec.ref, {});
  if (outcome === "applied") toast("Payment verified. Your subscription is active.");
}
