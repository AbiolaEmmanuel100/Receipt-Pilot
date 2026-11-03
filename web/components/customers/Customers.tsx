"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import * as S from "@/lib/storage";
import { money } from "@/lib/calc";
import { whatsappDigits } from "@/lib/phone";
import { loadHtml2canvas, download as pdfDownload, printElement } from "@/lib/pdf";
import { triggerDownload } from "@/lib/share";
import { toast } from "@/lib/bus";
import { AUTH_EVENT } from "@/lib/session";
import { useReceipts } from "@/lib/useReceipts";
import { buildGroup, customerList, fileStem, renderDoc, safeLogo, searchCustomers, summaryText, type CustomerRow } from "@/lib/customers";
import { Card } from "@/components/ui/Card";
import { Button, buttonClass } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { IconDownload, IconEye, IconFile, IconMail, IconPhone, IconPlus, IconPrint, IconSearch, IconShare, IconWhatsApp } from "@/components/ui/Icons";

function WaLink({ c }: { c: CustomerRow }) {
  const phone = String(c.phone || "").trim();
  const wa = whatsappDigits(phone, c.phoneCountry || "");
  if (wa) return <a className={buttonClass("ghost", "sm")} href={"https://wa.me/" + wa} target="_blank" rel="noopener"><IconWhatsApp className="size-4" />WhatsApp</a>;
  if (phone) return <span className="text-sm text-muted" title="Choose a country code on the receipt to enable WhatsApp">WhatsApp unavailable</span>;
  return null;
}

/** Native port of customers.html (same grouping, totals and record document). */
export function Customers() {
  const { rows } = useReceipts();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ key: string; name: string; summary: string; html: string; hasLogo: boolean } | null>(null);
  const docRef = useRef<HTMLDivElement>(null);

  const list = useMemo(() => customerList(rows), [rows]);
  const visible = searchCustomers(list, q);
  const searching = !!q.trim();

  useEffect(() => {
    const close = () => setOpen(null);
    document.addEventListener(AUTH_EVENT, close);
    return () => document.removeEventListener(AUTH_EVENT, close);
  }, []);
  useEffect(() => { if (!list.length) setOpen(null); }, [list.length]);

  async function openRecord(key: string) {
    const fresh = await S.getVisibleReceipts();
    const group = buildGroup(fresh, key);
    if (!group.name) { toast("Customer not found.", "error"); return; }
    const biz = await S.getBusiness();
    setOpen({ key, name: group.name, summary: summaryText(group), html: renderDoc(group, biz || {}), hasLogo: !!safeLogo(biz && biz.logo) });
  }

  async function captureDoc(): Promise<Blob> {
    const node = docRef.current;
    const html2canvas = await loadHtml2canvas();
    if (!node || !html2canvas) throw new Error("capture");
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
    return await new Promise((resolve, reject) => canvas.toBlob((b: Blob | null) => (b ? resolve(b) : reject(new Error("blob"))), "image/png"));
  }

  async function png() {
    if (!open) return;
    try {
      const blob = await captureDoc();
      const url = URL.createObjectURL(blob);
      triggerDownload(url, fileStem(open.name) + ".png");
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch { toast("Unable to download image.", "error"); }
  }
  async function pdf() {
    if (!open || !docRef.current) return;
    try { await pdfDownload(docRef.current, fileStem(open.name)); } catch { toast("Unable to download PDF.", "error"); }
  }
  async function share() {
    if (!open) return;
    try {
      const blob = await captureDoc();
      const file = new File([blob], fileStem(open.name) + ".png", { type: "image/png" });
      const n = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (typeof navigator.share === "function") {
        const data: ShareData = { title: "Customer Record", text: open.summary };
        if (n.canShare && n.canShare({ files: [file] })) data.files = [file];
        await navigator.share(data);
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(open.summary);
        toast("Customer summary copied.");
      }
    } catch (err: any) {
      if (err && err.name === "AbortError") return;
      toast("Unable to share.", "error");
    }
  }
  async function whatsapp() {
    if (!open) return;
    const text = encodeURIComponent(open.summary || "Customer record");
    try {
      const blob = await captureDoc();
      const file = new File([blob], fileStem(open.name) + ".png", { type: "image/png" });
      const n = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (typeof navigator.share === "function" && n.canShare && n.canShare({ files: [file] })) {
        await navigator.share({ title: "Customer Record", text: open.summary, files: [file] });
        return;
      }
    } catch { /* text fallback */ }
    window.open("https://wa.me/?text=" + text, "_blank", "noopener");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[1.625rem] font-bold tracking-tight md:text-[1.875rem]">Customers</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted">Customers from your receipts. Outstanding amounts are from unpaid and partially paid receipts only.</p>
      </div>
      <div className="relative">
        <label className="sr-only" htmlFor="custSearch">Search customers</label>
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted" />
        <input id="custSearch" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers by name, phone or email"
          className="block min-h-12 w-full rounded-2xl border border-line bg-white pl-11 pr-4 text-ink shadow-soft placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
      </div>

      {!visible.length ? (
        <Card id="custEmpty" className="px-5 py-10 text-center">
          <h2 className="text-xl font-bold">{searching ? "No customers found." : "No customers yet"}</h2>
          <p className="mt-1 text-muted">{searching ? "Try a different name, phone or email." : "Save a receipt with a customer name to see them here."}</p>
          {!searching ? <Link href="/new" className={buttonClass("primary", "md", "mt-4")}><IconPlus className="size-5" />Create Receipt</Link> : null}
        </Card>
      ) : (
        <>
          <ul className="space-y-3 lg:hidden" aria-label="Customers">
            {visible.map((c) => (
              <li key={c.key}>
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[17px] font-semibold">{c.name}</p>
                      <p className="text-sm text-muted">{c.count} {c.count === 1 ? "receipt" : "receipts"} · Last {c.lastDate || "—"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Outstanding</p>
                      <p className={"tabular font-bold " + (c.outstanding > 0 ? "text-[#92400e]" : "text-ink")}>{money(c.outstanding, c.currency)}</p>
                    </div>
                  </div>
                  <dl className="tabular mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-bg p-2.5"><dt className="text-muted">Purchases</dt><dd className="font-bold">{money(c.purchases, c.currency)}</dd></div>
                    <div className="rounded-xl bg-bg p-2.5"><dt className="text-muted">Total Paid</dt><dd className="font-bold">{money(c.paid, c.currency)}</dd></div>
                  </dl>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => openRecord(c.key)}><IconEye className="size-4" />View Record</Button>
                    {c.phone ? <a className={buttonClass("ghost", "sm")} href={"tel:" + c.phone}><IconPhone className="size-4" />{c.phone}</a> : null}
                    {c.email ? <a className={buttonClass("ghost", "sm")} href={"mailto:" + c.email}><IconMail className="size-4" />Email</a> : null}
                    <WaLink c={c} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <Card className="hidden overflow-x-auto lg:block">
            <table className="w-full text-[15px]">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-muted">
                <tr>{["Name", "Phone", "Email", "Receipts", "Purchases", "Outstanding", "Last Purchase", "Total Paid", "Actions"].map((h) => <th key={h} className="whitespace-nowrap px-3 py-3">{h}</th>)}</tr>
              </thead>
              <tbody id="custBody" className="tabular divide-y divide-line">
                {visible.map((c) => (
                  <tr key={c.key} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 font-semibold">{c.name}</td>
                    <td className="whitespace-nowrap px-3 py-0">{c.phone ? <a className="inline-flex min-h-11 items-center text-brand underline-offset-2 hover:underline" href={"tel:" + c.phone}>{c.phone}</a> : "—"}</td>
                    <td className="px-3 py-0">{c.email ? <a className="inline-flex min-h-11 items-center text-brand underline-offset-2 hover:underline" href={"mailto:" + c.email}>{c.email}</a> : "—"}</td>
                    <td className="px-3 py-2.5">{c.count}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{money(c.purchases, c.currency)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{money(c.outstanding, c.currency)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{c.lastDate || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{money(c.paid, c.currency)}</td>
                    <td className="px-3 py-2"><div className="flex items-center gap-1"><Button size="sm" variant="secondary" onClick={() => openRecord(c.key)}>View Record</Button><WaLink c={c} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? open.name : "Customer record"} size="xl">
        <div className="mb-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={share}><IconShare className="size-4" />Share</Button>
          <Button size="sm" variant="secondary" onClick={whatsapp}><IconWhatsApp className="size-4" />WhatsApp</Button>
          <Button size="sm" variant="secondary" onClick={png}><IconDownload className="size-4" />Download PNG</Button>
          <Button size="sm" variant="secondary" onClick={pdf}><IconFile className="size-4" />Download PDF</Button>
          <Button size="sm" variant="secondary" onClick={() => printElement(docRef.current)}><IconPrint className="size-4" />Print</Button>
        </div>
        {open ? <div id="custRecordDoc" ref={docRef} className={"cust-record-doc rounded-xl border border-line" + (open.hasLogo ? "" : " hidden-logo")} dangerouslySetInnerHTML={{ __html: open.html }} /> : null}
      </Modal>
    </div>
  );
}
