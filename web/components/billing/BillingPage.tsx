"use client";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import * as B from "@/lib/billing";
import { publishPlanStatus } from "@/lib/planStatus";
import { userId } from "@/lib/session";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cx } from "@/components/ui/cx";
import { IconCheck, IconLock } from "@/components/ui/Icons";

/**
 * /billing (and /billing.html, the Paystack callback). Behaviour is the same
 * as js/billing.js wirePage(): remember a returned reference, verify it, then
 * load status; resume on sign-in in another tab or when the tab is shown.
 */
export function BillingPage() {
  const [verify, setVerify] = useState("");
  const [error, setError] = useState("");
  const [signIn, setSignIn] = useState<{ on: boolean; label: string }>({ on: false, label: "Sign in to see your plan" });
  const [status, setStatus] = useState("Sign in to see your trial and subscription.");
  const [plans, setPlans] = useState<B.Plan[]>(B.FALLBACK_PLANS);
  const [plan, setPlan] = useState("monthly");
  const [busy, setBusy] = useState<"" | "checkout" | "refresh">("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    B.registerPage({
      setVerify: (t) => setVerify(t),
      setError: (t) => setError(t),
      setSignIn: (on, label) => setSignIn({ on, label }),
      setStatus: (t, data) => {
        // Known Worker error while a Supabase grant is being fixed: show a calm line instead (text only; logic unchanged).
        setStatus(/^Could not read the trial date\./.test(t) ? "Couldn't check your plan right now. Use Refresh access to try again." : t);
        setLoading(false);
        // Share the fresh status (e.g. right after a verify) so app pages never show a stale "choose a plan" prompt.
        if (data) publishPlanStatus(userId() || "", data);
      },
    });
    const returned = B.referenceFromUrl();
    if (returned) B.rememberReference(returned);
    const onStorage = (e: StorageEvent) => { if (e && e.key === "receiptly-auth" && e.newValue) B.resumePage(); };
    const onVis = () => { if (document.visibilityState === "visible") B.resumePage(); };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVis);
    B.resumePage().finally(() => setLoading(false));
    B.fetchPlans().then(setPlans).catch(() => {});
    return () => {
      B.registerPage(null);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy("checkout");
    try { await B.pageCheckout(plan, setError); } finally { setBusy(""); }
  }
  async function refresh() {
    setBusy("refresh");
    try { await B.refreshAccess(); } finally { setBusy(""); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Subscription</h1>
        <p className="text-sm text-muted">Every account starts with a 14-day free trial. After that, choose a plan and pay on Paystack.</p>
      </div>

      <Card className="space-y-3 p-4 sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Your plan</h2>
        {loading ? <div className="skeleton h-6 w-3/4 rounded" aria-hidden="true" /> : null}
        <p id="billingStatus" className={cx("text-[15px] font-semibold", loading && "sr-only")}>{status}</p>
        <p id="billingVerify" role="status" aria-live="polite" className={cx("text-[15px]", verify ? "rounded-xl bg-brand-50 px-3 py-2 text-brand-deep" : "sr-only")}>{verify}</p>
        {signIn.on ? (
          <p id="billingSignIn"><ButtonLink href="/signin?next=%2Fbilling">{signIn.label}</ButtonLink></p>
        ) : null}
        <Button variant="secondary" size="sm" id="billingRefreshPage" onClick={refresh} busy={busy === "refresh"}>Refresh access</Button>
      </Card>

      <form id="billingForm" onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-lg font-bold">Plan</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {plans.map((p) => {
              const on = plan === p.code;
              const months = Number(p.months) || 0;
              const perMonth = months > 1 ? Math.round(p.naira / months) : 0;
              return (
                <label key={p.code} className={cx("press relative flex min-h-24 cursor-pointer flex-col justify-between rounded-2xl border-2 bg-white p-4 shadow-soft",
                  on ? "border-brand ring-4 ring-brand/15" : "border-line hover:border-slate-300")}>
                  <input type="radio" name="plan" value={p.code} checked={on} onChange={() => setPlan(p.code)} className="sr-only" />
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-bold">{p.label}</span>
                    <span className={cx("flex size-6 items-center justify-center rounded-full border-2", on ? "border-brand bg-brand text-white" : "border-slate-300")} aria-hidden="true">{on ? <IconCheck className="size-4" /> : null}</span>
                  </span>
                  <span className="mt-2">
                    <span className="tabular text-2xl font-extrabold">{B.money(p.naira)}</span>
                    {months ? <span className="text-sm text-muted"> / {months === 1 ? "month" : months + " months"}</span> : null}
                    {perMonth ? <span className="tabular block text-sm text-muted">{B.money(perMonth)} per month</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-line bg-white p-4">
          <legend className="px-1 text-sm font-bold">Renewal</legend>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
            <input type="radio" name="renewal" value="manual" defaultChecked className="mt-1 size-5 accent-brand" />
            <span>Manual renewal — you start each payment</span>
          </label>
          <label id="autoLabel" className="flex min-h-11 items-start gap-3 py-1 text-muted">
            <input type="radio" name="renewal" value="automatic" id="autoRenewal" disabled className="mt-1 size-5" />
            <span>Automatic renewal — not available until Paystack recurring plans are configured and you explicitly opt in</span>
          </label>
        </fieldset>

        <p className="text-sm text-muted">A successful one-time payment is not consent for future charges. Receipts already saved are not deleted if access expires. Files already stored on this device cannot be removed remotely.</p>
        <p className="text-sm text-muted">The charge is always in Nigerian Naira. Local currency display is an estimate only.</p>

        <p id="billingError" role="alert" className={cx("text-[15px] font-semibold text-danger", !error && "sr-only")}>{error}</p>
        <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
          <Button type="submit" size="lg" block id="checkoutBtn" busy={busy === "checkout"} className="md:w-auto"><IconLock className="size-5" />Continue to Paystack</Button>
          <p className="mt-1.5 text-center text-xs text-muted md:text-left">Payments by Paystack · charged in Naira</p>
        </div>
      </form>
    </div>
  );
}
