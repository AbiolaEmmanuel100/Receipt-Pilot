"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, m } from "framer-motion";
import { planStatus, loadPlanStatus, noticeFor, shownToday, markShown, lagosDay, type Notice } from "@/lib/planStatus";
import { claimDialog, paywall, showAuth, usageGate, chip, inlineAuthHost } from "@/lib/bus";
import { useStore } from "@/lib/useStore";
import { useSessionUser } from "@/lib/useSession";
import * as U from "@/lib/usage";
import * as B from "@/lib/billing";
import { claimLocal, logout } from "@/lib/account";
import { user as currentUser } from "@/lib/session";
import { Modal } from "@/components/ui/Modal";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Logo";
import { cx } from "@/components/ui/cx";
import { IconClock, IconCloud, IconInfo, IconOffline } from "@/components/ui/Icons";

/**
 * Access gate: the paywall rules that used to live inside the trial banner,
 * moved here unchanged (same as usage.js). Renders nothing itself.
 */
export function AccessGate() {
  const { user } = useSessionUser();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const state = U.accessState(user);
  useEffect(() => {
    if (!user) { U.hidePaywall(); return; }
    if (state === "unknown") return;
    if (state !== "ok") { U.showPaywall("", state === "error" ? "error" : "expired"); return; }
    U.hidePaywall();
  }, [user, state]);
  useEffect(() => {
    if (!user || state !== "ok" || !user.trialEndsAt) return;
    const end = new Date(user.trialEndsAt).getTime();
    if (isNaN(end) || end > now) return;
    const active = user.subscriptionStatus === "active" && user.subscriptionExpiresAt && Date.now() < new Date(user.subscriptionExpiresAt).getTime();
    if (!active) U.showPaywall("", "expired");
  }, [user, state, now]);
  return null;
}

/**
 * Plan notice (replaces the old trial banner's visible part). Driven only by GET /api/billing/status.
 * - More than 2 Lagos calendar days left (trial or paid): small notice, at most once per day per user.
 * - 2 days or less, or ended: shown on every page view until the status shows an active paid plan;
 *   "Close" hides it for this page view only.
 * - Missing/unreadable dates or a status error: nothing is shown (console only).
 * Fixed overlay, so it never moves the page (no layout shift). Access rules are unchanged:
 * the existing Paywall still decides what is blocked.
 */
export function PlanNotice() {
  const { user } = useSessionUser();
  const path = usePathname() || "";
  const st = useStore(planStatus);
  const wall = useStore(paywall);
  const uid = (user && user.id) || "";
  const sig = user ? (user.subscriptionStatus || "") + "|" + (user.subscriptionExpiresAt || "") + "|" + (user.trialEndsAt || "") : "";
  const lastSig = useRef<string | null>(null);
  const [closedOn, setClosedOn] = useState<string | null>(null);
  const [daily, setDaily] = useState<{ path: string; day: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { if (uid) loadPlanStatus(uid); }, [uid, path]);
  // Account rows changed (e.g. a payment was applied on another page): re-read the status now.
  useEffect(() => {
    if (!uid) { lastSig.current = null; return; }
    if (lastSig.current !== null && lastSig.current !== sig) loadPlanStatus(uid, 0);
    lastSig.current = sig;
  }, [uid, sig]);

  const notice: Notice = uid && st.state === "ok" && st.uid === uid ? noticeFor(st.data, now) : { level: "none" };

  // Once a day: decide on the first page view that has a "daily" notice.
  useEffect(() => {
    if (notice.level !== "daily" || !uid || daily) return;
    if (shownToday(uid)) { setDaily({ path: "", day: lagosDay(Date.now()) }); return; }
    markShown(uid);
    setDaily({ path, day: lagosDay(Date.now()) });
  }, [notice.level, uid, path, daily]);

  let show = false;
  if (notice.level === "urgent" || notice.level === "expired") show = closedOn !== path;
  else if (notice.level === "daily") show = !!daily && daily.path === path && closedOn !== path;
  // Reset the per-page close when the page changes; a daily notice already shown is not shown again.
  useEffect(() => {
    setClosedOn((c) => (c === path ? c : null));
    setDaily((d) => (d && d.path && d.path !== path ? { ...d, path: "" } : d));
  }, [path]);

  // The existing paywall is already the full-screen "choose a plan" prompt; never cover its buttons.
  if (wall.open) show = false;
  const loud = notice.level === "urgent" || notice.level === "expired";
  return (
    <AnimatePresence>
      {show && notice.level !== "none" ? (
        <m.div key={notice.level} id="planNotice" data-level={notice.level}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.2, ease: "easeOut" }}
          role={loud ? "alert" : "status"} aria-label={loud ? "Plan reminder" : "Plan notice"}
          className={cx("fixed inset-x-3 bottom-[calc(80px+env(safe-area-inset-bottom))] z-[80] mx-auto max-w-md rounded-2xl border p-3 shadow-lift lg:inset-x-auto lg:bottom-6 lg:right-6 lg:mx-0 lg:w-[380px] print:hidden",
            notice.level === "expired" ? "border-red-200 bg-white" : notice.level === "urgent" ? "border-amber-200 bg-warn-bg" : "border-line bg-white")}>
          <div className="flex items-start gap-3">
            <span className={cx("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", notice.level === "expired" ? "bg-red-50 text-danger" : notice.level === "urgent" ? "bg-white/70 text-[#92400e]" : "bg-brand-50 text-brand-deep")}>
              {loud ? <IconClock className="size-5" /> : <IconInfo className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p id="planNoticeText" className={cx("text-[15px] font-semibold leading-snug", notice.level === "urgent" ? "text-[#92400e]" : "text-ink")}>{notice.text}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {notice.level === "daily" && notice.kind === "subscription"
                  ? <ButtonLink href="/billing" size="sm" variant="secondary">Plan & billing</ButtonLink>
                  : <ButtonLink href="/billing" size="sm" variant={loud ? "primary" : "secondary"}>{loud ? "Choose a plan" : "View plans"}</ButtonLink>}
                <button type="button" id="planNoticeClose" onClick={() => setClosedOn(path)}
                  className="min-h-11 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-black/5">
                  {loud ? <>Close<span className="sr-only"> for now</span></> : "Dismiss"}
                </button>
              </div>
            </div>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Paywall (cannot be dismissed), same copy and actions as usage.js. */
export function Paywall() {
  const st = useStore(paywall);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [plans, setPlans] = useState<B.Plan[]>(B.FALLBACK_PLANS);
  useEffect(() => { if (st.open) B.fetchPlans().then(setPlans).catch(() => {}); }, [st.open]);
  const isError = st.mode === "error";
  async function refresh() {
    setBusy(true);
    setNote("Checking your access with the server...");
    try {
      const ref = B.pendingReference();
      const outcome = await B.refreshAccess();
      const u = currentUser();
      setNote(U.refreshMessage(U.accessState(u), u, outcome === "none" ? "" : outcome, ref));
    } finally { setBusy(false); }
  }
  return (
    <Modal open={st.open} dismissible={false} title={isError ? "We could not check your subscription" : U.PAYWALL_TITLE} size="md">
      <div className="space-y-4">
        <Wordmark />
        <p className="text-[15px] text-ink">{isError ? "Receipt Pilot could not reach the server to confirm your access. Your trial and payments are not affected. Try again in a moment." : (st.message || U.PAYWALL_COPY)}</p>
        <p className="text-sm text-muted">Saved receipts are kept. Access returns after the payment is verified by the server. This screen cannot be dismissed to restore access.</p>
        {!isError ? (
          <ul className="grid grid-cols-2 gap-2">
            {plans.map((p) => (
              <li key={p.code} className="rounded-xl border border-line bg-bg px-3 py-2 text-sm"><span className="block font-semibold">{p.label}</span><span className="tabular text-muted">{B.money(p.naira)}</span></li>
            ))}
          </ul>
        ) : null}
        <div className="grid gap-2">
          {!isError ? <ButtonLink href="/billing" size="lg" block>Choose a plan</ButtonLink> : null}
          <Button variant="secondary" block busy={busy} onClick={refresh}>{isError ? "Try again" : "I have paid — refresh access"}</Button>
          {note ? <p role="status" className="text-sm text-muted">{note}</p> : null}
          <Button variant="ghost" block onClick={() => logout()}>Sign out</Button>
        </div>
        <p className="text-center text-sm text-muted"><a className="underline" href="/privacy-policy">Privacy</a> · <a className="underline" href="/terms">Terms</a></p>
      </div>
    </Modal>
  );
}

export function UsageGate() {
  const gate = useStore(usageGate);
  const inline = useStore(inlineAuthHost);
  const open = gate && !inline;
  return (
    <Modal open={open} dismissible={false} title="Create a free account to continue" size="sm">
      <div className="space-y-4">
        <p className="text-[15px] text-muted">You&apos;ve used Receipt Pilot on this device before. Sign up or log in to keep saving receipts. Existing receipts on this device are not deleted.</p>
        <div className="grid gap-2">
          <Button size="lg" block onClick={() => { usageGate.set(false); showAuth("signup"); }}>Create Free Account</Button>
          <Button variant="secondary" block onClick={() => { usageGate.set(false); showAuth("login"); }}>Log In</Button>
        </div>
      </div>
    </Modal>
  );
}

export function ClaimDialog() {
  const st = useStore(claimDialog);
  return (
    <Modal open={st.open} dismissible={false} title="Sync existing receipts?" size="sm">
      <div className="space-y-4">
        <p className="text-[15px] text-muted">{"Sync existing receipts to your Receipt Pilot account? " + st.count + " receipt(s) on this device are not in your account yet."}</p>
        <div className="grid gap-2">
          <Button block onClick={() => claimLocal(true)}>Yes, sync them</Button>
          <Button variant="ghost" block onClick={() => claimLocal(false)}>Keep them on this device only</Button>
        </div>
      </div>
    </Modal>
  );
}

export function SyncChip() {
  const c = useStore(chip);
  if (!c) return null;
  const offline = /offline/i.test(c.text);
  return (
    <div role="status" aria-live="polite" className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+8px)] z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-navy px-3.5 py-1.5 text-sm font-semibold text-white shadow-lift">
      {offline ? <IconOffline className="size-4" /> : <IconCloud className="size-4" />}{c.text}
    </div>
  );
}
