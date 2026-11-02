"use client";
// Plan notice state, driven only by the Worker's GET /api/billing/status
// response (trial_ends_at, subscription.status / expires_at). Read-only: it
// never verifies, never creates a payment and never changes access rules —
// the existing paywall (usage.ts) still decides what is blocked.
import { createStore } from "./bus";
import * as B from "./billing";

export type PlanStatus =
  | { state: "idle" }
  | { state: "ok"; data: any; at: number; uid: string }
  | { state: "error"; error: string; at: number; uid: string };

export const planStatus = createStore<PlanStatus>({ state: "idle" });

let inflight: Promise<void> | null = null;

/** Fetch status (deduped). Reuses a result younger than maxAgeMs for the same user. */
export function loadPlanStatus(uid: string, maxAgeMs = 60000): Promise<void> {
  const cur = planStatus.get();
  if (cur.state !== "idle" && cur.uid === uid && Date.now() - cur.at < maxAgeMs) return Promise.resolve();
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await B.fetchStatus();
      if (!r) { planStatus.set({ state: "idle" }); return; }
      if ("error" in r) { console.warn("Receipt Pilot: plan status unavailable:", r.error); planStatus.set({ state: "error", error: r.error, at: Date.now(), uid }); return; }
      planStatus.set({ state: "ok", data: r.data, at: Date.now(), uid });
    } finally { inflight = null; }
  })();
  return inflight;
}

/** Called with the status the billing page just loaded (e.g. right after a verify), so no stale prompt survives. */
export function publishPlanStatus(uid: string, data: any) {
  if (!uid || !data || typeof data !== "object") return;
  planStatus.set({ state: "ok", data, at: Date.now(), uid });
}

export function clearPlanStatus() { planStatus.set({ state: "idle" }); }

// --- Rules ------------------------------------------------------------------

const DAY = 86400000;
const LAGOS = "Africa/Lagos";

/** Calendar day (YYYY-MM-DD) in Africa/Lagos. */
export function lagosDay(t: number | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LAGOS, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}
function dayNumber(t: number) { const [y, m, d] = lagosDay(t).split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); }
/** Whole Lagos calendar days from now until end (0 = ends today). */
export function calendarDaysLeft(end: number, now: number) { return dayNumber(end) - dayNumber(now); }

export type Notice =
  | { level: "none" }
  | { level: "daily"; kind: "trial" | "subscription"; days: number; end: number; text: string }
  | { level: "urgent"; kind: "trial" | "subscription"; days: number; end: number; text: string }
  | { level: "expired"; kind: "trial" | "subscription"; end: number; text: string };

function parse(v: any): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return isNaN(t) ? null : t;
}

function inDays(days: number) { return days <= 0 ? "today" : days === 1 ? "tomorrow" : "in " + days + " days"; }

/** What to show for a status response at time `now`. */
export function noticeFor(data: any, now = Date.now()): Notice {
  if (!data || typeof data !== "object") return { level: "none" };
  const sub = data.subscription || {};
  const subEnd = parse(sub.expires_at);
  const paidActive = sub.status === "active" && subEnd !== null && now < subEnd;
  const trialEnd = parse(B.trialEndFrom(data));

  if (paidActive) {
    const days = calendarDaysLeft(subEnd!, now);
    if (days > 2) return { level: "daily", kind: "subscription", days, end: subEnd!, text: "Your plan is active until " + B.formatTrialDate(subEnd) + "." };
    return { level: "urgent", kind: "subscription", days, end: subEnd!, text: "Your subscription ends " + inDays(days) + ". Choose a plan to keep creating receipts." };
  }
  // Not an active paid plan: a subscription that ran out after the trial counts as an ended subscription.
  if (subEnd !== null && subEnd <= now && (trialEnd === null || subEnd >= trialEnd)) {
    return { level: "expired", kind: "subscription", end: subEnd, text: "Your subscription has ended. Choose a plan to keep creating receipts." };
  }
  if (trialEnd === null) {
    console.info("Receipt Pilot: no readable trial date in plan status; plan notice not shown.", B.trialEndFrom(data) || "(missing)");
    return { level: "none" };
  }
  if (trialEnd <= now) return { level: "expired", kind: "trial", end: trialEnd, text: "Your free trial has ended. Choose a plan to keep creating receipts." };
  const days = calendarDaysLeft(trialEnd, now);
  if (days > 2) return { level: "daily", kind: "trial", days, end: trialEnd, text: "Free trial: " + days + " days left. Choose a plan any time." };
  return { level: "urgent", kind: "trial", days, end: trialEnd, text: "Your free trial ends " + inDays(days) + ". Choose a plan to keep creating receipts." };
}

// --- Once a day (normal state) ----------------------------------------------

const KEY = (uid: string) => "rp_plan_notice_" + uid;
export function shownToday(uid: string, now = Date.now()) {
  try { return localStorage.getItem(KEY(uid)) === lagosDay(now); } catch { return false; }
}
export function markShown(uid: string, now = Date.now()) {
  try { localStorage.setItem(KEY(uid), lagosDay(now)); } catch { /* ignore */ }
}
