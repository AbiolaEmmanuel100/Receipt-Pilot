/* eslint-disable @typescript-eslint/no-explicit-any */
import { config } from "./config";

// Public plan list (no auth). Kept free of Supabase imports so the marketing
// page can show live prices without loading the app code.
export interface Plan { code: string; label: string; naira: number; months?: number }

export const FALLBACK_PLANS: Plan[] = [
  { code: "monthly", label: "Monthly", naira: 1500, months: 1 },
  { code: "quarterly", label: "Quarterly", naira: 4275, months: 3 },
  { code: "semi_annual", label: "Semi-annual", naira: 8100, months: 6 },
  { code: "annual", label: "Annual", naira: 15300, months: 12 },
];
const LABELS: Record<string, string> = { monthly: "Monthly", quarterly: "Quarterly", semi_annual: "Semi-annual", annual: "Annual" };

export function worker() { return String(config.billingWorkerUrl || "").replace(/\/$/, ""); }
export function money(naira: number) { return "₦" + Number(naira || 0).toLocaleString("en-NG"); }

export function plansFrom(data: any): Plan[] {
  if (data && data.plans && data.plans.length) {
    return data.plans.map((p: any) => ({ code: p.code, label: p.label || LABELS[p.code] || p.code, naira: p.naira, months: p.months }));
  }
  return FALLBACK_PLANS.slice();
}

/** GET /api/billing/plans (public). Falls back to the known plan list. */
export async function fetchPlans(): Promise<Plan[]> {
  const base = worker();
  if (!base) return FALLBACK_PLANS.slice();
  try {
    const res = await fetch(base + "/api/billing/plans");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return FALLBACK_PLANS.slice();
    return plansFrom(data);
  } catch { return FALLBACK_PLANS.slice(); }
}
