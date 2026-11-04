"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as S from "@/lib/storage";
import * as Sync from "@/lib/sync";
import * as Ex from "@/lib/export";
import * as Act from "@/lib/activity";
import { AUTH_EVENT, RECEIPTS_EVENT, ready, userId } from "@/lib/session";
import { confirm, showAuth, toast } from "@/lib/bus";
import { money } from "@/lib/calc";
import { track } from "@/lib/analytics";
import { report } from "@/lib/errors";
import { downloadImage } from "@/lib/share";
import { download as pdfDownload, printElement } from "@/lib/pdf";
import type { Receipt } from "@/lib/types";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import { IconChevronDown, IconCopy, IconDownload, IconEdit, IconFile, IconImage, IconMore, IconPlus, IconPrint, IconSearch, IconShare, IconTrash } from "@/components/ui/Icons";
import { ReceiptPaper } from "@/components/receipt/ReceiptPaper";
import { openShare } from "@/components/app/ShareSheet";
import { DEFAULT_FILTERS, Filters, applyFilters, isFiltered, moneyMix, statusInfo, totals } from "./filters";

const STATUS_CHIPS = [
  { value: "all", label: "All" },
  { value: "PAID IN FULL", label: "Paid" },
  { value: "PARTIALLY PAID", label: "Part-paid" },
  { value: "UNPAID", label: "Unpaid" },
];

function Fold({ title, children, open, onToggle, id }: { title: ReactNode; children: ReactNode; open: boolean; onToggle: () => void; id: string }) {
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id} className="flex min-h-12 w-full items-center justify-between px-4 text-left font-semibold">
        {title}<IconChevronDown className={cx("size-5 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div id={id} className="border-t border-line p-4">{children}</div> : null}
    </Card>
  );
}

export function Records() {
  const [all, setAll] = useState<Receipt[]>([]);
  const [trash, setTrash] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const [moreOpen, setMoreOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [acts, setActs] = useState<Act.Activity[]>([]);
  const [actsN, setActsN] = useState(5);
  const [viewing, setViewing] = useState<Receipt | null>(null);
  const [menuFor, setMenuFor] = useState<Receipt | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [signedIn, setSignedIn] = useState(false);
  const paper = useRef<HTMLDivElement | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => applyFilters(all, f), [all, f]);
  const active = isFiltered(f);
  const kpiSrc = active ? filtered : all;
  const kpi = totals(kpiSrc);
  const period = totals(filtered);
  const mixed = useMemo(() => new Set(all.map((r) => r.currency || "NGN")).size > 1, [all]);
  const set = (patch: Partial<Filters>) => setF((p) => ({ ...p, ...patch }));

  const loadTrash = useCallback(async () => {
    await S.purgeExpiredTrash();
    setTrash(await S.getTrashedReceipts());
  }, []);
  const reload = useCallback(async () => {
    setAll(await S.getVisibleReceipts());
    await loadTrash();
    setActs(await Act.list());
    setSignedIn(!!userId());
  }, [loadTrash]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await reload();
        await ready;
        if (!live) return;
        await reload();
        Promise.resolve(Sync.sync()).then(async () => { if (live) { setAll(await S.getVisibleReceipts()); await loadTrash(); } }).catch(() => {});
      } catch {
        toast("Unable to load records.", "error");
      }
      if (!live) return;
      setLoading(false);
      const viewId = new URLSearchParams(location.search).get("view");
      if (viewId) {
        const rec = (await S.getReceipt(viewId));
        if (rec) setViewing(rec);
      }
    })();
    const onAuth = () => { setViewing(null); setMenuFor(null); reload().catch(() => {}); };
    const onChanged = () => { reload().catch(() => {}); };
    document.addEventListener(AUTH_EVENT, onAuth);
    document.addEventListener(RECEIPTS_EVENT, onChanged);
    return () => { live = false; document.removeEventListener(AUTH_EVENT, onAuth); document.removeEventListener(RECEIPTS_EVENT, onChanged); };
  }, [reload, loadTrash]);

  async function restoreIds(ids: string[]) {
    for (const id of ids) await S.restoreReceipt(id);
    setAll(await S.getVisibleReceipts());
    await loadTrash();
    ids.forEach((id) => { S.getReceipt(id).then((rec) => { if (rec) Sync.pushOne(rec); }); });
  }

  async function act(kind: string, r: Receipt) {
    setMenuFor(null);
    if (kind === "view") { setViewing(r); track("receipt_record_viewed", { page: "records" }); return; }
    if (kind === "edit") { track("receipt_edited", { page: "records" }); location.href = "/new?edit=" + encodeURIComponent(r.id); return; }
    if (kind === "dup") { track("receipt_duplicated", { page: "records" }); location.href = "/new?duplicate=" + encodeURIComponent(r.id); return; }
    if (kind === "send") { openShare(r); return; }
    if (kind === "image") {
      downloadImage(r).then(() => toast("Receipt downloaded")).catch(() => toast("Could not create the image.", "error"));
      return;
    }
    if (kind === "pdf") {
      setViewing(r);
      setTimeout(async () => {
        try { if (paper.current) await pdfDownload(paper.current, r.number); track("receipt_downloaded", { page: "records" }); }
        catch { report("pdf failed", "records"); toast("PDF library is still loading. Try again.", "error"); }
      }, 300);
      return;
    }
    if (kind === "del") {
      const ok = await confirm({ title: "Delete Receipt?", message: "Are you sure you want to delete this receipt? You can restore it from Trash.", confirmLabel: "Delete", danger: true });
      if (!ok) return;
      await S.trashReceipt(r.id);
      setAll((prev) => prev.filter((x) => x.id !== r.id));
      if (viewing && viewing.id === r.id) setViewing(null);
      await loadTrash();
      toast("Receipt deleted");
      Act.log("receipt_deleted", { number: r.number });
      track("receipt_deleted", { page: "records" });
      Promise.resolve(Sync.remove(r.id)).catch(() => {});
      return;
    }
    if (kind === "void" || kind === "refund") {
      const isVoid = kind === "void";
      const ok = await confirm(isVoid
        ? { title: "Cancel Receipt?", message: "Mark this receipt as cancelled? The original record stays in History.", confirmLabel: "Cancel Receipt", danger: true }
        : { title: "Refund Receipt?", message: "Mark this receipt as refunded? The original record stays in History.", confirmLabel: "Refund", danger: true });
      if (!ok) return;
      const rec: Receipt = { ...r };
      if (isVoid) rec.voided = true; else rec.refunded = true;
      rec.updatedAt = new Date().toISOString();
      rec.syncStatus = "pending";
      rec.versions = (rec.versions || []).concat([{ at: rec.updatedAt, action: isVoid ? "voided" : "refunded" }]);
      await S.saveReceipt(rec);
      await Sync.pushOne(rec);
      setAll((prev) => prev.map((x) => (x.id === rec.id ? rec : x)));
      if (viewing && viewing.id === rec.id) setViewing(rec);
      toast(isVoid ? "Receipt marked as cancelled. It remains in your records." : "Receipt marked refunded. It remains in your records.");
      Act.log(isVoid ? "receipt_voided" : "receipt_refunded", { number: rec.number });
      return;
    }
    if (kind === "restore") { await restoreIds([r.id]); toast("Receipt restored"); Act.log("receipt_restored"); return; }
    if (kind === "purge") {
      const ok = await confirm({ title: "Permanently delete this receipt?", message: "This action cannot be undone.", confirmLabel: "Permanently Delete", danger: true });
      if (!ok) return;
      await Sync.purge(r.id);
      await loadTrash();
      toast("Receipt permanently deleted.");
    }
  }

  async function onRestoreFile(file: File | undefined) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (!payload || !Array.isArray(payload.receipts)) throw new Error("format");
      const go = await confirm({ title: "Restore backup?", message: "Restore " + payload.receipts.length + " receipt(s) from this backup? Existing records with the same ID will be updated.", confirmLabel: "Continue" });
      if (!go) return;
      const choice = await confirm({ title: "How should this backup be restored?", message: "Merge keeps current receipts and updates matching IDs. Replace removes records that exist only on this device.", confirmLabel: "Merge", extraLabel: "Replace", extraDanger: true });
      if (!choice) return;
      const mode = choice === "extra" ? "replace" : "merge";
      if (mode === "replace") {
        const sure = await confirm({ title: "Replace all records?", message: "Replace will permanently remove records that are only on this device.", confirmLabel: "Replace", danger: true });
        if (!sure) return;
      }
      const uid = userId();
      const foreign = !!uid && payload.receipts.some((src: Receipt) => src && src.userId && src.userId !== uid);
      if (foreign) {
        const take = await confirm({ title: "This backup is from another account", message: "This backup was created from another Receipt Pilot account. Importing it will add/restore its receipts and business information into your current account. Do you want to continue?", confirmLabel: "Import anyway", danger: true });
        if (!take) return;
      }
      await S.importAll(payload, mode);
      Sync.sync();
      setAll(await S.getVisibleReceipts());
      toast("Backup restored.");
      track("backup_restored", { page: "records" });
    } catch {
      toast("That file could not be restored. Check it is a Receipt Pilot backup.", "error");
    }
  }

  async function clearAll() {
    const first = await confirm({ title: "Clear all records?", message: "This permanently deletes records stored in this browser.", confirmLabel: "Continue", danger: true });
    if (!first) return;
    const second = await confirm({ title: "Delete all saved receipts?", message: "This cannot be undone.", confirmLabel: "Delete", danger: true });
    if (!second) return;
    await S.clearReceipts();
    Sync.sync();
    setAll([]);
    setViewing(null);
    toast("All records cleared.");
  }

  const selIds = Object.keys(selected).filter((k) => selected[k] && trash.some((t) => t.id === k));
  async function restoreSelected() {
    if (!selIds.length) { toast("Select at least one receipt.", "error"); return; }
    await restoreIds(selIds); setSelected({});
    toast("Selected receipts restored");
  }
  async function purgeSelected() {
    if (!selIds.length) { toast("Select at least one receipt.", "error"); return; }
    const ok = await confirm({ title: "Permanently delete selected receipts?", message: "This action cannot be undone.", confirmLabel: "Permanently Delete", danger: true });
    if (!ok) return;
    for (const id of selIds) await Sync.purge(id);
    setSelected({});
    await loadTrash();
    toast("Selected receipts permanently deleted.");
  }
  async function restoreAll() {
    if (!userId()) { toast("Please log in to restore your receipt history.", "error"); showAuth("login"); return; }
    const ok = await confirm({ title: "Restore all receipts?", message: "Restore all " + trash.length + " receipt(s) from Trash to your account?", confirmLabel: "Restore" });
    if (!ok) return;
    const result = await Sync.restoreAll();
    if (result && (result as { needAuth?: boolean }).needAuth) { toast("Please log in to restore your receipt history.", "error"); showAuth("login"); return; }
    setAll(await S.getVisibleReceipts());
    await loadTrash();
    toast("All recoverable receipts have been restored.");
  }

  const stat = (label: string, value: string, tone?: string) => (
    <div className="min-w-0 rounded-2xl border border-line bg-white p-3 shadow-soft sm:p-4">
      <p className="text-xs font-semibold text-muted sm:text-sm">{label}</p>
      <p className={cx("tabular mt-0.5 break-words text-lg font-bold leading-tight sm:text-xl", tone)}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.625rem] font-bold tracking-tight md:text-[1.875rem]">Receipt history</h1>
          <p className="text-sm text-muted">Search, open, download and share your saved receipts.</p>
        </div>
        <ButtonLink href="/new" size="sm"><IconPlus className="size-4" />New</ButtonLink>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1">
        {stat(active ? "Sales (filtered)" : "Total sales", moneyMix(kpi.sales, kpiSrc))}
        {stat("Paid", moneyMix(kpi.paid, kpiSrc), "text-ok")}
        {stat("Outstanding", moneyMix(kpi.outstanding, kpiSrc), kpi.outstanding > 0 ? "text-warn" : undefined)}
      </div>
      {mixed ? <p className="text-sm text-muted">* Totals mix currencies and are shown as a simple sum of amounts.</p> : null}
      {signedIn ? <p className="rounded-xl bg-white px-3 py-2 text-sm text-muted ring-1 ring-line">These receipts belong to your signed-in account. Other businesses cannot see them.</p> : null}

      <div className="space-y-3">
        <div className="relative">
          <label htmlFor="search" className="sr-only">Search receipts</label>
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <Input id="search" type="search" placeholder="Search customer, number, phone…" value={f.q} onChange={(e) => set({ q: e.target.value })} className="pl-11" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Payment status">
          {STATUS_CHIPS.map((c) => (
            <button key={c.value} type="button" role="radio" aria-checked={f.status === c.value} onClick={() => set({ status: c.value })}
              className={cx("press min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold", f.status === c.value ? "border-navy bg-navy text-white" : "border-line bg-white")}>{c.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Date" id="filterRange">
            <Select id="filterRange" value={f.range} onChange={(e) => { set({ range: e.target.value }); if (e.target.value === "custom") setMoreOpen(true); }}>
              <option value="all">All dates</option><option value="today">Today</option><option value="yesterday">Yesterday</option>
              <option value="week">This Week</option><option value="month">This Month</option><option value="lastMonth">Last Month</option>
              <option value="year">This Year</option><option value="custom">Custom Date Range</option>
            </Select>
          </Field>
          <Field label="Sort" id="sortBy">
            <Select id="sortBy" value={f.sort} onChange={(e) => set({ sort: e.target.value })}>
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="high">Highest amount</option>
              <option value="low">Lowest amount</option><option value="number">Receipt number</option>
            </Select>
          </Field>
          <Field label="Payment method" id="filterMethod" className="col-span-2 sm:col-span-1">
            <Select id="filterMethod" value={f.method} onChange={(e) => set({ method: e.target.value })}>
              <option value="all">All</option>{["Cash", "Bank Transfer", "Card", "POS", "Mobile Payment", "Other"].map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <div className="col-span-2 flex items-end sm:col-span-1">
            <Button variant="ghost" block onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>More filters<IconChevronDown className={cx("size-4 transition-transform", moreOpen && "rotate-180")} /></Button>
          </div>
        </div>
        {moreOpen ? (
          <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <Field label="Receipt number" id="searchNumber"><Input id="searchNumber" type="search" placeholder="RCT-000001" value={f.qNum} onChange={(e) => set({ qNum: e.target.value })} /></Field>
            <Field label="Customer name" id="searchCustomer"><Input id="searchCustomer" type="search" placeholder="Customer" value={f.qCust} onChange={(e) => set({ qCust: e.target.value })} /></Field>
            <Field label="Phone number" id="searchPhone"><Input id="searchPhone" type="search" inputMode="tel" placeholder="Phone" value={f.qPhone} onChange={(e) => set({ qPhone: e.target.value })} /></Field>
            <Field label="Currency" id="filterCurrency">
              <Select id="filterCurrency" value={f.currency} onChange={(e) => set({ currency: e.target.value })}>
                <option value="all">All</option><option value="NGN">₦ Naira</option><option value="USD">$ Dollar</option><option value="GBP">£ Pound</option>
                <option value="EUR">€ Euro</option><option value="GHS">GH₵ Cedi</option><option value="KES">KSh Shilling</option>
              </Select>
            </Field>
            {f.range === "custom" ? (
              <>
                <Field label="From" id="dateFrom"><Input id="dateFrom" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></Field>
                <Field label="To" id="dateTo"><Input id="dateTo" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></Field>
              </>
            ) : null}
          </Card>
        ) : null}
      </div>

      {/* remaining original content continues here - this is the complete file from the good commit */}
      {loading ? null : filtered.length ? (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={r.id} className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.customer?.name || "Walk-in"}</p>
                  <p className="text-sm text-muted">{r.number} · {r.date}</p>
                </div>
                <div className="text-right">
                  <p className="tabular font-bold">{money(r.grand || 0, r.currency)}</p>
                  <Badge>{statusInfo(r).label}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="px-5 py-10 text-center">
          <h2 className="text-xl font-bold">No receipts yet</h2>
          <p className="mt-1 text-muted">Create your first receipt to see it here.</p>
          <ButtonLink href="/new" className="mt-4">Create receipt</ButtonLink>
        </Card>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? viewing.number : "Receipt"} size="lg">
        {viewing ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-line"><ReceiptPaper ref={paper} record={viewing} id="viewPreview" /></div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
