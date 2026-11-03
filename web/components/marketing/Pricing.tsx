"use client";
import { useEffect, useState } from "react";
import { FALLBACK_PLANS, fetchPlans, money, type Plan } from "@/lib/plans";

/** Prices come from /api/billing/plans (the Worker); the fallback is the same list. */
export function Pricing() {
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  useEffect(() => { let on = true; fetchPlans().then((p) => { if (on && p.length) setPlans(p); }); return () => { on = false; }; }, []);
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {plans.map((p) => {
        const months = p.months || 1;
        const perMonth = months > 1 ? Math.round(p.naira / months) : 0;
        const featured = p.code === "monthly";
        return (
          <li key={p.code} className={"rounded-2xl border bg-white p-5 " + (featured ? "border-brand ring-1 ring-brand" : "border-line")}>
            <p className="text-[15px] font-bold text-slate-700">{p.label}</p>
            <p className="tabular mt-1 text-3xl font-bold tracking-tight text-ink">{money(p.naira)}</p>
            <p className="tabular mt-1 text-sm text-muted">{months === 1 ? "per month" : `every ${months} months · ${money(perMonth)} a month`}</p>
          </li>
        );
      })}
    </ul>
  );
}
