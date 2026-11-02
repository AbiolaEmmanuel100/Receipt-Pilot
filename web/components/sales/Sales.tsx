"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { money as calcMoney } from "@/lib/calc";
import { downloadCsv } from "@/lib/export";
import { download as pdfDownload } from "@/lib/pdf";
import { toast } from "@/lib/bus";
import { useReceipts } from "@/lib/useReceipts";
import {
  aggregateProducts, iso, money, normStatus, periodBounds, periodList, productCsv, productSource, productTotals, statusText, summarize,
  type Preset, type View,
} from "@/lib/sales";
import { Badge, Card } from "@/components/ui/Card";
import { Button, buttonClass } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { IconChevronDown, IconDownload, IconFile, IconPlus } from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";

function Stat({ label, id, children, big }: { label: string; id: string; children: ReactNode; big?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p id={id} className={cx("tabular mt-1 font-extrabold tracking-tight text-ink", big ? "text-[1.35rem] sm:text-2xl" : "text-xl")}>{children}</p>
    </div>
  );
}

function Fold({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group rounded-card border border-line bg-white shadow-soft">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 text-lg font-bold sm:px-5 [&::-webkit-details-marker]:hidden">
        {title}<IconChevronDown className="size-5 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-4 pb-5 pt-4 sm:px-5">{children}</div>
    </details>
  );
}

const th = "whitespace-nowrap px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-muted";
const td = "whitespace-nowrap px-3 py-2.5";

function triggerText(content: string, name: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/** Native port of sales.html + js/sales.js (same data, same figures). */
export function Sales() {
  const { rows: all } = useReceipts();
  const [view, setView] = useState<View>("daily");
  const [preset, setPreset] = useState<Preset>("today");
  const [day, setDay] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [product, setProduct] = useState("");
  const [pay, setPay] = useState("all");
  const report = useRef<HTMLDivElement>(null);

  useEffect(() => { setDay(iso(new Date())); }, []);

  const b = periodBounds({ preset, view, day, from, to });
  const list = useMemo(() => periodList(all, b.from, b.to), [all, b.from, b.to]);
  const s = summarize(list);
  const ref = list.length ? list : all;
  const products = aggregateProducts(productSource(list, pay), product);
  const pt = productTotals(products);
  const none = !all.filter((r) => !r.isDraft).length;
  const days: Record<string, typeof list> = {};
  list.forEach((r) => { const k = r.date as string; days[k] = days[k] || []; days[k].push(r); });

  const custom = preset === "custom";
  const showDay = preset === "today" && view === "daily";

  function pickView(v: View) {
    setView(v);
    setPreset(v === "weekly" ? "week" : v === "monthly" ? "month" : "today");
  }

  async function downloadPdf() {
    const node = report.current;
    if (!node) return;
    const sections = Array.from(node.querySelectorAll("details"));
    const previous = sections.map((d) => d.open);
    sections.forEach((d) => { d.open = true; });
    try { await pdfDownload(node, "sales-report"); }
    catch { toast("PDF library is still loading.", "error"); }
    finally { sections.forEach((d, i) => { d.open = previous[i]; }); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[1.75rem] font-extrabold tracking-tight md:text-3xl">Sales records</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted">These figures are calculated from your saved receipts. This is a sales report, not a profit or stock report.</p>
      </div>

      {none ? (
        <Card id="salesEmpty" className="px-5 py-10 text-center">
          <h2 className="text-xl font-bold">No receipts yet</h2>
          <p className="mt-1 text-muted">Create your first receipt to get started.</p>
          <Link href="/new" className={buttonClass("primary", "md", "mt-4")}><IconPlus className="size-5" />Create Receipt</Link>
        </Card>
      ) : null}

      <Card className="space-y-4 p-4 sm:p-5">
        <div role="group" aria-label="Quick period" className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1 sm:inline-grid sm:w-auto">
          {(["daily", "weekly", "monthly"] as View[]).map((v) => (
            <button key={v} type="button" data-sales-view={v} aria-pressed={view === v} onClick={() => pickView(v)}
              className={cx("press min-h-11 rounded-xl px-5 text-[15px] font-semibold capitalize transition-colors", view === v ? "bg-white text-brand-deep shadow-sm" : "text-slate-600 hover:text-ink")}>
              {v}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Reporting period" id="salesPreset">
            <Select id="salesPreset" value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">This week</option>
              <option value="lastWeek">Last week</option>
              <option value="month">This month</option>
              <option value="lastMonth">Last month</option>
              <option value="custom">Custom date range</option>
            </Select>
          </Field>
          {showDay ? <Field label="Specific day" id="salesDay"><Input type="date" id="salesDay" value={day} onChange={(e) => setDay(e.target.value)} /></Field> : null}
          {custom ? <>
            <Field label="From" id="salesFrom"><Input type="date" id="salesFrom" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To" id="salesTo"><Input type="date" id="salesTo" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </> : null}
        </div>
        <p id="salesPeriod" className="text-[15px] font-semibold text-slate-700" aria-live="polite">{"Showing " + (b.from === b.to ? b.from : (b.from + " to " + b.to))}</p>
      </Card>

      {!none ? (
        <div id="salesReport" ref={report} className="space-y-5 bg-bg">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat big label="Total Sales" id="salesTotal">{money(s.sales, ref)}</Stat>
            <Stat big label="Amount Collected" id="salesPaid">{money(s.paid, ref)}</Stat>
            <Stat big label="Outstanding Balance" id="salesOut">{money(s.outstanding, ref)}</Stat>
            <Stat big label="Number of Receipts" id="salesCount">{String(s.count)}</Stat>
            <Stat label="Average Sale" id="salesAvg">{money(s.avg, ref)}</Stat>
            <Stat label="Refunded Total" id="salesRefunded">{money(s.refunded, ref)}</Stat>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-[15px]">
            <span className="font-semibold text-slate-700">Payment status:</span>
            <Badge tone="ok"><span id="salesPaidN">{s.nPaid}</span>&nbsp;fully paid</Badge>
            <Badge tone="warn"><span id="salesPartN">{s.nPart}</span>&nbsp;partially paid</Badge>
            <Badge tone="danger"><span id="salesUnpaidN">{s.nUnpaid}</span>&nbsp;unpaid</Badge>
          </p>
          <Button id="salesPdf" onClick={downloadPdf} className="w-full sm:w-auto" data-html2canvas-ignore><IconFile className="size-5" />Download PDF report</Button>

          <Fold title="Product Sales" open>
            <p className="text-sm text-muted">Allocated sales and payments by product. This is not profit or inventory.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Search product" id="salesProduct"><Input type="search" id="salesProduct" placeholder="Iron, Rice, Blender" value={product} onChange={(e) => setProduct(e.target.value)} /></Field>
              <Field label="Payment status" id="salesPayStatus">
                <Select id="salesPayStatus" value={pay} onChange={(e) => setPay(e.target.value)}>
                  <option value="all">All payments</option>
                  <option value="PAID IN FULL">Fully paid</option>
                  <option value="PARTIALLY PAID">Partially paid</option>
                  <option value="UNPAID">Unpaid</option>
                </Select>
              </Field>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Total units sold" id="productUnits">{String(pt.qty)}</Stat>
              <Stat label="Total product sales value" id="productSales">{money(pt.sales, ref)}</Stat>
              <Stat label="Total amount collected" id="productCollected">{money(pt.collected, ref)}</Stat>
              <Stat label="Total outstanding" id="productOutstanding">{money(pt.outstanding, ref)}</Stat>
            </div>
            {products.length ? (
              <div id="productTableWrap" className="mt-4 overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-[15px]">
                  <thead className="bg-slate-50"><tr><th className={th}>Product</th><th className={th}>Quantity sold</th><th className={th}>Sales value</th><th className={th}>Amount collected</th><th className={th}>Outstanding</th></tr></thead>
                  <tbody id="productBody" className="tabular divide-y divide-line">
                    {products.map((row) => (
                      <tr key={row.name}><td className={cx(td, "font-semibold")}>{row.name}</td><td className={td}>{row.qty}</td><td className={td}>{money(row.sales, ref)}</td><td className={td}>{money(row.collected, ref)}</td><td className={td}>{money(row.outstanding, ref)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div id="productEmpty" className="mt-4 rounded-xl border border-dashed border-line px-4 py-6 text-center">
                <p className="font-semibold">No products match these filters</p>
                <p className="mt-1 text-sm text-muted">Try another product name, payment status, or date range.</p>
              </div>
            )}
            <Button id="productCsv" variant="secondary" className="mt-4" data-html2canvas-ignore onClick={() => {
              const src = productSource(periodList(all, b.from, b.to).filter((r) => !r.voided && !r.refunded), pay);
              triggerText(productCsv(aggregateProducts(src, product)), "product-sales-" + b.from + "-to-" + b.to + ".csv");
            }}><IconDownload className="size-5" />Download product CSV</Button>
          </Fold>

          <Fold title="Daily Breakdown">
            <div id="dayBreakdown" className="grid gap-2 sm:grid-cols-2">
              {Object.keys(days).sort().map((d) => {
                const sub = summarize(days[d]);
                return (
                  <div key={d} className="rounded-xl border border-line bg-bg p-3">
                    <p className="text-sm font-semibold text-muted">{d}</p>
                    <p className="tabular text-lg font-bold">Sales {money(sub.sales, days[d])}</p>
                    <p className="tabular text-sm text-slate-700">Paid {money(sub.paid, days[d])} · Yet to be paid {money(sub.outstanding, days[d])}</p>
                  </div>
                );
              })}
            </div>
          </Fold>

          <Fold title="Receipt Details">
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-[15px]">
                <thead className="bg-slate-50"><tr><th className={th}>Date</th><th className={th}>Receipt No.</th><th className={th}>Customer</th><th className={th}>Total</th><th className={th}>Paid</th><th className={th}>Outstanding</th><th className={th}>Status</th></tr></thead>
                <tbody id="salesBody" className="tabular divide-y divide-line">
                  {list.length ? list.map((r) => {
                    const st = normStatus(r.status);
                    const cur = r.currency || "NGN";
                    return (
                      <tr key={r.id}>
                        <td className={td}>{r.date}</td><td className={td}>{r.number}</td><td className={td}>{(r.customer && r.customer.name) || "—"}</td>
                        <td className={td}>{calcMoney(r.grand, cur)}</td><td className={td}>{calcMoney(r.paid, cur)}</td><td className={td}>{calcMoney(r.balance, cur)}</td>
                        <td className={td}><Badge tone={st === "PAID IN FULL" ? "ok" : st === "PARTIALLY PAID" ? "warn" : "danger"}>{statusText(st)}</Badge></td>
                      </tr>
                    );
                  }) : <tr><td colSpan={7} className={td}>No receipts in this period.</td></tr>}
                </tbody>
              </table>
            </div>
            <Button id="salesCsv" variant="secondary" className="mt-4" data-html2canvas-ignore onClick={() => downloadCsv(periodList(all, b.from, b.to))}><IconDownload className="size-5" />Download receipt CSV</Button>
          </Fold>
        </div>
      ) : null}
    </div>
  );
}
