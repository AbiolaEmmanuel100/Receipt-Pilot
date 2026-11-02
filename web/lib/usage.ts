import { user, userId } from "./session";
import { usageGate, paywall } from "./bus";
import type { SessionUser } from "./types";

// Port of js/usage.js: guest-session rule, trial/paid entitlement, account
// gate and paywall. Same storage keys and the same rules.
const VISIT_KEY = "receiptly_has_visited";
const SESSION_GUEST_KEY = "receiptly_session_guest_ok";
export const GATE_SESSION = "receiptly_account_gate_shown";

function loggedIn() { return !!userId(); }

export function cleanOldGateKeys() {
  try {
    localStorage.removeItem("receiptly_usage_v1");
    localStorage.removeItem("receiptly_usage_banner_day");
    localStorage.removeItem("receiptly_first_use");
    localStorage.removeItem("receiptly_signup_dismiss");
    sessionStorage.removeItem("receiptly_gate_shown");
  } catch { /* ignore */ }
}

function hasVisited() {
  try { return localStorage.getItem(VISIT_KEY) === "true"; } catch { return false; }
}

function allowGuestThisSession() {
  try { return sessionStorage.getItem(SESSION_GUEST_KEY) === "1"; } catch { return false; }
}

export function initGuestSession() {
  if (loggedIn()) return;
  if (allowGuestThisSession()) return;
  if (!hasVisited()) {
    try {
      localStorage.setItem(VISIT_KEY, "true");
      sessionStorage.setItem(SESSION_GUEST_KEY, "1");
    } catch { /* ignore */ }
  }
}

export function endGuestSession() {
  try { sessionStorage.removeItem(SESSION_GUEST_KEY); } catch { /* ignore */ }
}

export function requiresAccount() {
  if (loggedIn()) return false;
  return !allowGuestThisSession();
}

export function entitled(u: SessionUser | null) {
  if (!u) return false;
  const now = Date.now();
  if (u.subscriptionStatus === "active" && u.subscriptionExpiresAt && now < new Date(u.subscriptionExpiresAt).getTime()) return true;
  if (u.trialEndsAt && now < new Date(u.trialEndsAt).getTime()) return true;
  return false;
}

export type AccessState = "unknown" | "error" | "ok" | "expired";
export function accessState(u: SessionUser | null): AccessState {
  if (!u || !u.entitlementChecked) return "unknown";
  if (u.entitlementError && !u.entitlementLoadedAt) return "error";
  return entitled(u) ? "ok" : "expired";
}

export function daysLeft(u: SessionUser | null) {
  if (!u || !u.trialEndsAt) return null;
  return Math.ceil((new Date(u.trialEndsAt).getTime() - Date.now()) / 86400000);
}

export function canPersist() {
  if (loggedIn()) {
    const state = accessState(user());
    if (state === "unknown") return true;
    return state === "ok";
  }
  initGuestSession();
  return allowGuestThisSession();
}

export const PAYWALL_TITLE = "Your free trial has ended";
export const PAYWALL_COPY = "Your 14-day free trial is over. Choose a plan to restore access to your Receipt Pilot workspace and protected online records.";

export function showPaywall(message: string, mode: "expired" | "error") {
  paywall.set({ open: true, mode, message: message || PAYWALL_COPY });
}

export function hidePaywall() {
  paywall.set({ ...paywall.get(), open: false });
}

export function showGate(): boolean {
  if (loggedIn()) {
    const u = user();
    const state = accessState(u);
    if (state === "error") showPaywall("", "error");
    else if (state === "expired") {
      showPaywall(u && (u.trialEndsAt || u.subscriptionExpiresAt)
        ? PAYWALL_COPY
        : "We could not confirm an active trial. Existing dates are not reset, and a new trial is not created. Choose a plan to continue.", "expired");
    }
    return false;
  }
  initGuestSession();
  if (!requiresAccount()) return false;
  usageGate.set(true);
  return true;
}

/** Paywall note after "I have paid — refresh access" (same wording). */
export function refreshMessage(state: AccessState, u: SessionUser | null, outcome: string, ref: string) {
  if (state === "ok") return "";
  const label = ref ? "Payment " + ref : "Your payment";
  if (outcome === "review") return label + " needs a manual review before it can be activated. Do not pay again.";
  if (outcome === "held") return label + " belongs to a different Receipt Pilot account. Sign in with the account that started the payment.";
  if (outcome === "pending") return label + " is not confirmed by Paystack yet. Bank transfers can take a few minutes. Do not pay twice.";
  if (outcome === "signed_out") return "Your session has ended. Sign in again to finish activating your payment.";
  if (outcome === "retry") return "Could not finish checking " + (ref ? "payment " + ref : "your payment") + ". Try again shortly. Do not pay twice.";
  if (outcome === "cleared") return label + " was not activated. Paystack did not confirm it as a successful Receipt Pilot payment.";
  if (outcome === "applied") return "Payment verified. Loading your access...";
  if (u && u.entitlementError) return "Could not reach the server. Try again shortly.";
  return "No activated payment found yet for this account. Bank transfers can take a few minutes. Do not pay twice.";
}
