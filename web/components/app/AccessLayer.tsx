"use client";
import { useEffect, useState } from "react";
import { claimDialog, paywall, showAuth, usageGate, chip } from "@/lib/bus";
import { useStore } from "@/lib/useStore";
import { useSessionUser } from "@/lib/useSession";
import * as U from "@/lib/usage";
import * as B from "@/lib/billing";
import { claimLocal, logout } from "@/lib/account";
import { user as currentUser } from "@/lib/session";
import { Modal } from "@/components/ui/Modal";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Logo";
import { IconCloud, IconOffline } from "@/components/ui/Icons";

/** Trial banner: same rules as usage.js showTrialBanner, shown as days left. */
export function TrialBanner() {
  const { user } = useSessionUser();
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState(false);
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
  if (!user || state !== "ok") return null;
  if (user.subscriptionStatus === "active" && user.subscriptionExpiresAt && now < new Date(user.subscriptionExpiresAt).getTime()) return null;
  const end = new Date(user.trialEndsAt || "").getTime();
  if (!user.trialEndsAt || isNaN(end)) return null;
  const diff = end - now;
  if (diff <= 0) return null;
  const warn = diff <= 3 * 86400000;
  if (dismissed && !warn) return null;
  const days = Math.ceil(diff / 86400000);
  const label = days <= 1 ? "Your free trial ends today" : "Free trial: " + days + " days left";
  return (
    <div className={"border-b " + (warn ? "border-amber-200 bg-warn-bg" : "border-brand-light bg-brand-50")} role="region" aria-label="Free trial">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <p className={"text-sm font-semibold " + (warn ? "text-[#92400e]" : "text-brand-deep")}>{label}{warn ? " · choose a plan to keep access" : ""}</p>
        <div className="flex items-center gap-1">
          <ButtonLink href="/billing" size="sm" variant={warn ? "primary" : "secondary"}>View plans</ButtonLink>
          {!warn ? <button type="button" onClick={() => setDismissed(true)} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-white/60">Not now</button> : null}
        </div>
      </div>
    </div>
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
  const open = useStore(usageGate);
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
