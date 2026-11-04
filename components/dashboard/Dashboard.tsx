"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import * as S from "@/lib/storage";
import * as B from "@/lib/billing";
import { money as calcMoney } from "@/lib/calc";
import { iso, money, periodList, startOfWeek, summarize } from "@/lib/sales";
import { useReceipts } from "@/lib/useReceipts";
import { useSessionUser } from "@/lib/useSession";
import { useStore } from "@/lib/useStore";
import { planStatus, loadPlanStatus } from "@/lib/planStatus";
import { applyFilters, DEFAULT_FILTERS, statusInfo } from "@/components/records/filters";
import { Badge, Card } from "@/components/ui/Card";
import { Button, buttonClass } from "@/components/ui/Button";
import { IconArrowRight, IconCard, IconChart, IconPlus, IconReceipt, IconUsers } from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";
import { InstallCard } from "@/components/app/Install";

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Figures for the dashboard, using the same rules as the Sales page. */
export function dashboardFigures(all: import("@/lib/types").Receipt[], now = new Date()) {
  const today = iso(now);
  const live = all.filter((r) => !r.isDraft);
  const todayList = periodList(all, today, today);
  const weekList = periodList(all, iso(startOfWeek(now)), today);
  const monthList = periodList(all, iso(new Date(now.getFullYear(), now.getMonth(), 1)), today);
  return {
    today: summarize(todayList), todayList,
    week: summarize(weekList), weekList,
    month: summarize(monthList), monthList,
    allTime: summarize(live), live,
    recent: applyFilters(live, DEFAULT_FILTERS).slice(0, 5),
  };
}

function Stat({ label, value, sub, tone, id }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "brand" | "warn"; id: string }) {
  return (
    <Card className="min-h-28 p-4">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p id={id} className={cx("tabular mt-1.5 text-[1.2rem] font-bold leading-tight tracking-tight sm:text-[1.45rem]", tone === "warn" ? "text-[#92400e]" : "text-ink")}>{value}</p>
      {sub ? <p className="mt-0.5 text-sm text-muted">{sub}</p> : null}
    </Card>
  );
}


export function Dashboard() {
  const { user } = useSessionUser();
  const { rows, loaded } = useReceipts();
  const [bizName, setBizName] = useState("");
  const plan = useStore(planStatus);
  const [hello, setHello] = useState("Welcome");

  useEffect(() => { setHello(greeting()); S.getBusiness().then((b) => setBizName((b && b.name) || "")).catch(() => {}); }, []);
  // Same GET /api/billing/status as the billing page, shared with the plan notice (one request per page view).
  const uid = (user && user.id) || "";
  useEffect(() => { if (uid) loadPlanStatus(uid); }, [uid]);
  const status = plan.state === "ok" && plan.uid === uid ? { text: B.describeStatus(plan.data) } : plan.state === "error" && plan.uid === uid ? { error: plan.error } : null;

  const f = useMemo(() => dashboardFigures(rows), [rows]);
  const name = bizName || (user && user.businessName) || "";
  const m = (n: number, list: typeof rows) => money(n, list.length ? list : rows);

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">{hello}</p>
          <h1 id="dashName" className="truncate text-[1.625rem] font-bold tracking-tight md:text-[1.875rem]">{name || (user && user.email) || "Your business"}</h1>
        </div>
        <Link href="/new" className={buttonClass("primary", "lg", "w-full sm:w-auto")}><IconPlus className="size-5" />Create receipt</Link>
      </div>

      <section aria-labelledby="sum-h">
        <h2 id="sum-h" className="sr-only">Summary</h2>
        {!loaded ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat id="dashToday" label="Sales today" value={m(f.today.sales, f.todayList)} sub={f.today.count + (f.today.count === 1 ? " receipt" : " receipts")} />
            <Stat id="dashWeek" label="Receipts this week" value={String(f.week.count)} sub={"Sales " + m(f.week.sales, f.weekList)} />
            <Stat id="dashMonth" label="Sales this month" value={m(f.month.sales, f.monthList)} sub={"Collected " + m(f.month.paid, f.monthList)} />
            <Stat id="dashOut" label="Yet to be paid" value={m(f.allTime.outstanding, f.live)} sub="All receipts" tone={f.allTime.outstanding > 0 ? "warn" : undefined} />
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold">Recent receipts</h2>
            <Link href="/records" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[15px] font-semibold text-brand hover:bg-brand-50">View all<IconArrowRight className="size-4" /></Link>
          </div>
          {!loaded ? <div className="skeleton h-48 rounded-xl" /> : f.recent.length ? (
            <ul id="dashRecent" className="divide-y divide-line">
              {f.recent.map((r) => {
                const st = statusInfo(r);
                return (
                  <li key={r.id}>
                    <Link href={"/records?view=" + encodeURIComponent(r.id)} className="tap -mx-2 flex min-h-[60px] items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand" aria-hidden="true"><IconReceipt className="size-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{(r.customer && r.customer.name) || "Walk-in customer"}</span>
                        <span className="block truncate text-sm text-muted">{r.number} · {r.date}</span>
                      </span>
                      <span className="text-right">
                        <span className="tabular block font-bold">{calcMoney(r.grand, r.currency || "NGN")}</span>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
              <p className="font-semibold">No receipts yet</p>
              <p className="mt-1 text-sm text-muted">Create your first receipt to get started.</p>
              <Link href="/new" className={buttonClass("primary", "md", "mt-4")}>Create receipt</Link>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            <div className="flex items-center gap-2"><IconCard className="size-5 text-brand" /><h2 className="text-[17px] font-semibold">Your plan</h2></div>
            <div id="dashPlan" className="mt-2 text-[15px]" aria-live="polite">
              {!status ? <div className="skeleton h-12 rounded-lg" /> :
                "error" in status ? <p className="text-muted">See Plan &amp; billing for your trial and subscription.</p> :
                <p>{status.text}</p>}
            </div>
            <Link href="/billing" className={buttonClass("secondary", "md", "mt-3 w-full")}>Plan & billing</Link>
          </Card>
          <Card className="p-2">
            <ul>
              {[
                { href: "/records", label: "Receipt history", icon: IconReceipt },
                { href: "/sales", label: "Sales records", icon: IconChart },
                { href: "/customers", label: "Customers", icon: IconUsers },
              ].map((it) => (
                <li key={it.href}>
                  <Link href={it.href} className="tap flex min-h-12 items-center gap-3 rounded-xl px-3 font-medium hover:bg-slate-50">
                    <it.icon className="size-5 text-brand" /><span className="flex-1">{it.label}</span><IconArrowRight className="size-4 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <InstallCard />
        </div>
      </div>
    </div>
  );
}
