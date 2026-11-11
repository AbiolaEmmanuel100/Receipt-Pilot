"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as S from "@/lib/storage";
import * as Sync from "@/lib/sync";
import * as U from "@/lib/usage";
import { AUTH_EVENT, ready, userId } from "@/lib/session";
import { confirm, toast } from "@/lib/bus";
import { money, CURRENCY_OPTIONS } from "@/lib/calc";
import { splitStored, suggestedIso } from "@/lib/phone";
import { today, nowTime, uid } from "@/lib/val";
import { makeToken, downloadImage } from "@/lib/share";
import { download as pdfDownload, printElement } from "@/lib/pdf";
import { track } from "@/lib/analytics";
import { report } from "@/lib/errors";
import { log as activityLog } from "@/lib/activity";
import { TEMPLATES, templateLabel } from "@/lib/templates";
import type { Business, Receipt } from "@/lib/types";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChipGroup, Field, Input, Select, Textarea, inputClass } from "@/components/ui/Field";
import { PhoneField } from "@/components/ui/PhoneField";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import { IconChevronDown, IconDownload, IconEdit, IconEye, IconImage, IconMinus, IconPlus, IconPrint, IconShare, IconTrash, IconCheck, IconList } from "@/components/ui/Icons";
import { ReceiptPaper } from "@/components/receipt/ReceiptPaper";
import { openShare } from "@/components/app/ShareSheet";
import { amountsLocked, applyEditLock, editLockError, isOwing, paymentLocked } from "@/lib/payments";
import { FormState, ItemField, emptyForm, effectivePaid, isDirty, lockedPaid, newItem, readForm, statusMessage, withBusiness, withRecord } from "./form";

const FORM_DRAFT = "receiptly_open_form_v1";
const PAY_METHODS = ["Cash", "Bank Transfer", "Card", "POS", "Mobile Payment", "Other"].map((v) => ({ value: v, label: v }));
const STATUSES = [
  { value: "UNPAID", label: "Unpaid" },
  { value: "PARTIALLY PAID", label: "Partially paid" },
  { value: "PAID IN FULL", label: "Paid in full" },
];

function formDraftKey() { return FORM_DRAFT + ":" + (userId() || "guest"); }

function businessFromReceipts(rows: Receipt[]) {
  const list = (rows || []).slice().sort((a, b) => {
    const sa = String((a && (a.updatedAt || a.createdAt || a.date)) || "");
    const sb = String((b && (b.updatedAt || b.createdAt || b.date)) || "");
    return sa < sb ? 1 : -1;
  });
  for (const r of list) {
    const b = r && r.business;
    if (b && (b.name || b.address || b.phone || b.email || b.website || b.logo)) return b;
  }
  return null;
}

function mergeBizFallback(saved: Business, src: Partial<Business> | null): Business {
  const out: Business = Object.assign({}, S.emptyBusiness(), saved || {});
  const s = src || {};
  if (!out.name && s.name) out.name = s.name;
  if (!out.address && s.address) out.address = s.address;
  if (!out.phone && s.phone) out.phone = s.phone;
  if (!out.email && s.email) out.email = s.email;
  if (!out.website && s.website) out.website = s.website;
  if (!out.logo && s.logo) out.logo = s.logo;
  if (!out.footer && s.footer) out.footer = s.footer;
  if ((!out.prefix || out.prefix === "RCT-") && s.prefix) out.prefix = s.prefix as string;
  if (!out.taxPct && s.taxPct) out.taxPct = s.taxPct as string;
  return out;
}

function niceDate(d: string) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function Generator() {
  const [f, setF] = useState<FormState>(emptyForm);
  const fr = useRef(f);
  fr.current = f;
  const [editingId, setEditingId] = useState<string | null>(null);
  // Payment fields of the receipt being edited are locked once it owes money or
  // has recorded payments; they change only via Record payment in Receipt history.
  const [editLock, setEditLock] = useState<{ pay: boolean; amounts: boolean; owing?: boolean }>({ pay: false, amounts: false });
  const editRef = useRef<string | null>(null);
  editRef.current = editingId;
  const lastSaved = useRef<string | null>(null);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [booted, setBooted] = useState(false);
  // Keep the form hidden (not unmounted) until saved business/details are applied, so the business card
  // does not visibly collapse and shift the page on load. Safety net: reveal after 1.2s regardless.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (booted) { setShown(true); return; }
    const t = setTimeout(() => setShown(true), 1200);
    return () => clearTimeout(t);
  }, [booted]);
  const [bizOpen, setBizOpen] = useState(true);
  const [bizMore, setBizMore] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [saved, setSaved] = useState<{ record: Receipt; text: string } | null>(null);
  const [customers, setCustomers] = useState<Record<string, Receipt["customer"]>>({});
  const [logoError, setLogoError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const authGen = useRef(0);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createdTracked = useRef(false);
  const previewDesk = useRef<HTMLDivElement | null>(null);
  const previewSheet = useRef<HTMLDivElement | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  const data = useMemo(() => readForm(f), [f]);
  const hint = statusMessage(data);
  const locked = lockedPaid(f) != null;
  const dirty = isDirty(f);

  const update = useCallback((patch: Partial<FormState>) => {
    setF((prev) => ({ ...prev, ...patch }));
  }, []);

  // persistOpenForm / restoreOpenForm --------------------------------------
  const persistOpenForm = useCallback(() => {
    const cur = fr.current;
    try {
      if (savingRef.current || !isDirty(cur)) { localStorage.removeItem(formDraftKey()); return; }
      const d = readForm(cur);
      localStorage.setItem(formDraftKey(), JSON.stringify({
        customer: d.customer,
        notes: cur.notes, discount: cur.discount, taxPct: cur.taxPct, amountPaid: effectivePaid(cur),
        paymentMethod: cur.payment, paymentStatus: cur.status, currency: cur.currency,
        items: cur.items.map((it) => ({ name: it.name, qty: it.qty, price: it.price })),
      }));
    } catch { /* ignore */ }
  }, []);
  function clearOpenForm() { try { localStorage.removeItem(formDraftKey()); } catch { /* ignore */ } }
  function restoreOpenForm(base: FormState): FormState {
    try {
      const raw = localStorage.getItem(formDraftKey());
      if (!raw) return base;
      const d = JSON.parse(raw);
      if (!d) return base;
      const next = { ...base };
      if (d.customer) {
        next.custName = d.customer.name || "";
        const sp = splitStored(d.customer.phone || "", d.customer.phoneCountry || "", next.custIso);
        next.custPhone = sp.value;
        next.custIso = sp.iso;
        next.custEmail = d.customer.email || "";
      }
      if (d.notes != null) next.notes = d.notes;
      if (d.discount != null) next.discount = d.discount;
      if (d.taxPct != null) next.taxPct = d.taxPct;
      if (d.amountPaid != null) next.paid = String(d.amountPaid);
      if (d.paymentMethod) next.payment = d.paymentMethod;
      if (d.paymentStatus) next.status = d.paymentStatus;
      if (d.currency) next.currency = d.currency;
      if (d.items && d.items.length) next.items = d.items.map((it: ItemField) => newItem(it));
      return next;
    } catch { return base; }
  }
  useEffect(() => {
    if (!booted) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(persistOpenForm, 400);
  }, [f, booted, persistOpenForm]);

  // Customer datalist ---------------------------------------------------------
  async function loadCustomerOptions() {
    const rows = await S.getVisibleReceipts();
    const seen: Record<string, Receipt["customer"]> = {};
    rows.forEach((r) => {
      const name = r.customer && r.customer.name && String(r.customer.name).trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seen[key]) return;
      seen[key] = r.customer;
    });
    setCustomers(seen);
  }

  function suggest(cur?: string) { return suggestedIso(cur); }
  function customerDefaultIso(base: FormState) { return base.bizIso || suggestedIso(base.currency); }

  async function freshNumber(prefix: string) {
    const seq = await S.peekNumber();
    return S.formatNumber(Number(seq) + 1, prefix || "RCT-");
  }

  // newReceipt() + applyStoredBusiness() + restoreOpenForm()
  async function resetForm(gen: number, opts: { restore: boolean; keep?: { currency?: string; template?: string } }) {
    const bizSaved = await S.getBusiness();
    if (gen !== authGen.current) return;
    let biz = bizSaved;
    if (!S.businessFilled(biz)) {
      const rows = await S.getVisibleReceipts();
      if (gen !== authGen.current) return;
      biz = mergeBizFallback(biz, businessFromReceipts(rows));
    }
    let next = withBusiness(emptyForm(), biz || S.emptyBusiness(), suggest);
    next.taxPct = (bizSaved && bizSaved.taxPct ? String(bizSaved.taxPct) : "");
    if (opts.keep && opts.keep.currency) next.currency = opts.keep.currency;
    if (opts.keep && opts.keep.template) next.template = opts.keep.template;
    next.date = today(); next.time = nowTime();
    next.custIso = customerDefaultIso(next);
    next.number = await freshNumber(next.prefix);
    if (gen !== authGen.current) return;
    if (opts.restore) next = restoreOpenForm(next);
    setEditingId(null);
    setEditLock({ pay: false, amounts: false });
    setF(next);
    setBizOpen(!(biz && biz.name));
  }

  // Boot -------------------------------------------------------------------
  useEffect(() => {
    let live = true;
    (async () => {
      await ready;
      if (!live) return;
      const gen = authGen.current;
      Promise.resolve(Sync.sync()).then(async () => {
        if (gen !== authGen.current || editRef.current || isDirty(fr.current)) return;
        const biz = await S.getBusiness();
        if (S.businessFilled(biz)) setF((prev) => withBusiness(prev, biz, suggest));
      }).catch(() => {});
      const params = new URLSearchParams(location.search);
      const editId = params.get("edit");
      const dupId = params.get("duplicate");
      const biz = await S.getBusiness();
      await loadCustomerOptions();
      if (editId) {
        const rec = await S.getReceipt(editId);
        if (rec) {
          setEditingId(rec.id);
          setEditLock({ pay: paymentLocked(rec), amounts: amountsLocked(rec), owing: isOwing(rec) });
          setF(withRecord(withBusiness(emptyForm(), biz, suggest), rec, suggest));
          setBizOpen(false);
          setBooted(true);
          return;
        }
      }
      if (dupId) {
        const src = await S.getReceipt(dupId);
        if (src) {
          const copy: Receipt = JSON.parse(JSON.stringify(src));
          copy.date = today(); copy.time = nowTime();
          copy.number = await freshNumber((biz && biz.prefix) || "RCT-");
          setEditingId(null);
          setF(withRecord(withBusiness(emptyForm(), biz, suggest), copy, suggest));
          setBizOpen(false);
          toast("Duplicated. Save to create a new record.");
          setBooted(true);
          return;
        }
      }
      await resetForm(gen, { restore: true });
      setBooted(true);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth changes: reset to the new account's business and draft (only when the
  // signed-in account actually changes, so a background entitlement refresh
  // never wipes a receipt in progress).
  useEffect(() => {
    let lastUid: string | null | undefined;
    ready.then(() => { lastUid = userId(); });
    const on = () => {
      const now = userId();
      if (lastUid === undefined || now === lastUid) return;
      lastUid = now;
      const gen = ++authGen.current;
      if (draftTimer.current) clearTimeout(draftTimer.current);
      lastSaved.current = null;
      resetForm(gen, { restore: true }).then(loadCustomerOptions).catch(() => {});
    };
    document.addEventListener(AUTH_EVENT, on);
    const onSeq = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (editRef.current) return;
      const cur = fr.current.number.trim();
      const parsed = S.parseSeqFromNumber(cur, d.prefix);
      if (!cur || (parsed > 0 && parsed <= d.seq)) update({ number: S.formatNumber(Number(d.seq) + 1, d.prefix) });
    };
    document.addEventListener(Sync.SEQUENCE_EVENT, onSeq);
    return () => { document.removeEventListener(AUTH_EVENT, on); document.removeEventListener(Sync.SEQUENCE_EVENT, onSeq); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leave protection (beforeunload + in-app links) ---------------------------
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (savingRef.current || !isDirty(fr.current)) return;
      persistOpenForm();
      e.preventDefault();
      e.returnValue = "";
    };
    const click = async (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
      const href = a.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#" || href.indexOf("javascript:") === 0) return;
      if (savingRef.current || !isDirty(fr.current)) return;
      if (/^\/new($|[#?])/.test(href) && !/[?&](edit|duplicate)=/.test(href)) return;
      e.preventDefault();
      e.stopPropagation();
      persistOpenForm();
      const leave = await confirm({ title: "Leave this receipt?", message: "You have unsaved changes. Your information may be lost.", confirmLabel: "Leave", cancelLabel: "Stay" });
      if (leave) location.href = a.href;
    };
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", before); document.removeEventListener("click", click, true); };
  }, [persistOpenForm]);

  // Items -------------------------------------------------------------------
  function setItem(key: number, patch: Partial<ItemField>) {
    if (!createdTracked.current) { createdTracked.current = true; track("receipt_created", { page: "generator" }); }
    setF((prev) => ({ ...prev, items: prev.items.map((it) => (it.key === key ? { ...it, ...patch } : it)) }));
  }
  function removeItem(key: number) {
    setF((prev) => ({ ...prev, items: prev.items.length === 1 ? [newItem()] : prev.items.filter((it) => it.key !== key) }));
  }
  function addItem() {
    const it = newItem();
    setF((prev) => ({ ...prev, items: [...prev.items, it] }));
    setTimeout(() => document.getElementById("item-name-" + it.key)?.focus(), 30);
  }
  function step(it: ItemField, delta: number) {
    const q = Math.max(0, (Number(it.qty) || 0) + delta);
    setItem(it.key, { qty: String(q) });
  }

  // Business ----------------------------------------------------------------
  async function saveBizSettings() {
    const d = readForm(fr.current);
    const cur = fr.current;
    await S.saveBusiness({
      name: cur.bizName, address: cur.bizAddress, phone: d.business!.phone, phoneCountry: d.business!.phoneCountry,
      email: cur.bizEmail, website: cur.bizWebsite, logo: cur.logo, prefix: cur.prefix || "RCT-",
      currency: cur.currency || "NGN", template: cur.template, taxPct: cur.taxDefault !== "" ? cur.taxDefault : cur.taxPct, footer: cur.bizFooter || "",
    });
    toast("Settings saved");
    try { await Sync.pushBusiness(); } catch { /* still saved locally */ }
    setBizOpen(false);
  }
  function onLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setLogoError("Please choose an image file."); return; }
    setLogoError("");
    const reader = new FileReader();
    reader.onload = () => update({ logo: String(reader.result || "") });
    reader.readAsDataURL(file);
  }
  async function pickTemplate(id: string) {
    update({ template: id });
    setTemplatesOpen(false);
    const biz = (await S.getBusiness()) || S.emptyBusiness();
    biz.template = id;
    await S.saveBusiness(biz);
    try { await Sync.pushBusiness(); } catch { /* ignore */ }
  }

  // Number ------------------------------------------------------------------
  async function assignNumberIfNeeded(): Promise<string> {
    const current = fr.current.number.trim();
    if (current) return current;
    const biz = await S.getBusiness();
    const prefix = (biz && biz.prefix) || fr.current.prefix || "RCT-";
    const peek = Number(await S.peekNumber()) || 0;
    if (peek === 0 && userId()) {
      try {
        const allocated = await Sync.allocateReceiptNumber(prefix);
        if (allocated) {
          fr.current = { ...fr.current, number: allocated };
          update({ number: allocated });
          await S.catchUpSequence([allocated], prefix);
          return allocated;
        }
      } catch { /* local fallback */ }
    }
    const seq = await S.nextNumber();
    const num = S.formatNumber(seq, prefix);
    fr.current = { ...fr.current, number: num };
    update({ number: num });
    return num;
  }

  // Save (port of saveReceipt) ----------------------------------------------
  async function saveReceipt() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const done = () => { savingRef.current = false; setSaving(false); };
    try {
      const d = readForm(fr.current);
      const hasItem = (d.items || []).some((it) => String(it.name || "").trim() && (Number(it.qty) || 0) > 0);
      if (!hasItem || !((d.grand || 0) > 0)) { toast("Please add at least one item before generating the receipt.", "error"); done(); return; }
      const mismatch = statusMessage(d);
      if (mismatch) { toast(mismatch, "error"); done(); return; }
      if (!U.canPersist()) { U.showGate(); done(); return; }
      if (!d.date) d.date = today();
      if (!d.time) d.time = nowTime();
      if (!fr.current.number.trim()) await assignNumberIfNeeded();
      d.number = fr.current.number.trim();
      const editing = editRef.current;
      const existing = await S.getReceiptByNumber(d.number);
      if (existing && existing.id !== editing) { toast("Receipt number already exists. Choose another.", "error"); done(); return; }
      if (!(d.business && d.business.name) && !editing) {
        const stored = await S.getBusiness();
        if (stored && (stored.name || stored.address || stored.phone || stored.email)) {
          d.business = { name: stored.name || "", address: stored.address || "", phone: stored.phone || "", phoneCountry: stored.phoneCountry || "", email: stored.email || "", website: stored.website || "", logo: stored.logo || "", footer: stored.footer || "" };
          if (!d.taxPct && stored.taxPct) d.taxPct = Number(stored.taxPct);
        }
      }
      if (!editing && !existing) {
        const peek = await S.peekNumber();
        const formatted = S.formatNumber(Number(peek) + 1, fr.current.prefix || "RCT-");
        if (d.number === formatted) await S.nextNumber();
      }
      const now = new Date().toISOString();
      let record: Receipt;
      if (editing) {
        const prev = await S.getReceipt(editing);
        if (!prev) { toast("That receipt is not available on this account.", "error"); setEditingId(null); done(); return; }
        const lockMsg = editLockError(prev, d);
        if (lockMsg) { toast(lockMsg, "error"); done(); return; }
        record = Object.assign({}, prev, applyEditLock(prev, d), {
          id: editing, updatedAt: now, createdAt: prev.createdAt ? prev.createdAt : now,
          shareToken: prev.shareToken || makeToken(),
          versions: (prev.versions || []).concat([{ at: now, action: "edited" }]).slice(-20),
        }) as Receipt;
        const still = await S.getReceipt(editing);
        if (!still) { toast("That receipt is not available on this account.", "error"); setEditingId(null); done(); return; }
      } else {
        record = Object.assign({}, d, { id: uid(), createdAt: now, updatedAt: now, versions: [{ at: now, action: "created" }], shareToken: makeToken() }) as Receipt;
      }
      if (userId()) record.userId = userId();
      record.syncStatus = "pending";
      record.isDraft = false;
      await S.saveReceipt(record);
      if (editing) {
        const stillOwned = await S.getReceipt(editing);
        if (!stillOwned) { setEditingId(null); done(); return; }
      }
      track("receipt_saved", { currency: record.currency, template: record.template, payment_method: record.payment, payment_status: record.status });
      lastSaved.current = record.id;
      activityLog(editing ? "receipt_edited" : "receipt_created", { number: record.number });
      const synced = await Sync.pushOne(record);
      if (userId() && navigator.onLine && !synced) toast("Saved on this device, but your account could not be updated. Receipt Pilot will retry when the connection is stable.", "error");
      let text: string;
      if (synced) text = "Receipt #" + record.number + " is saved in your Receipt Pilot account and Receipt History.";
      else if (userId() && !navigator.onLine) text = "Receipt #" + record.number + " is saved on this device. It will appear in your account when you are back online.";
      else if (userId()) text = "Receipt #" + record.number + " is on this device, but your account did not update. Receipt Pilot will retry. It is not confirmed in the cloud yet.";
      else text = "Receipt #" + record.number + " is saved in Receipt History on this device. Log in to keep it across devices.";
      setPreviewOpen(false);
      setSaved({ record, text });
      toast("Receipt saved ✓");
      clearOpenForm();
      const cur = fr.current;
      await S.saveBusiness({
        name: record.business!.name, address: record.business!.address,
        phone: record.business!.phone, phoneCountry: record.business!.phoneCountry || "",
        email: record.business!.email, website: record.business!.website, logo: record.business!.logo,
        prefix: cur.prefix || "RCT-", footer: cur.bizFooter || record.business!.footer || "",
        currency: record.currency, template: record.template,
        taxPct: cur.taxDefault !== "" ? cur.taxDefault : (record.taxPct as number),
      });
      // resetAfterSave(): keep currency + template, fresh number, stored business.
      savingRef.current = false;
      const gen = authGen.current;
      await resetForm(gen, { restore: false, keep: { currency: record.currency, template: record.template } });
      loadCustomerOptions();
    } catch (err) {
      report((err && (err as Error).message) || "save", "save");
      toast("Unable to save this receipt. It was not stored. Please try again.", "error");
    } finally {
      done();
    }
  }

  async function saveDraft() {
    try {
      if (!U.canPersist()) { U.showGate(); return; }
      if (!fr.current.number.trim()) await assignNumberIfNeeded();
      const d = readForm(fr.current);
      d.number = fr.current.number.trim();
      if (!d.date) d.date = today();
      if (!d.time) d.time = nowTime();
      const now = new Date().toISOString();
      const editing = editRef.current;
      let record: Receipt = { id: editing || uid(), number: d.number, createdAt: now, updatedAt: now, isDraft: true, syncStatus: "pending", shareToken: makeToken() };
      if (editing) {
        const prev = await S.getReceipt(editing);
        if (paymentLocked(prev)) { toast("This receipt is already saved and has a balance or payments. Use Save receipt to keep your changes.", "error"); return; }
        record = Object.assign({}, prev, d, record, { id: editing, createdAt: prev && prev.createdAt ? prev.createdAt : now, shareToken: (prev && prev.shareToken) || record.shareToken }) as Receipt;
      } else {
        record = Object.assign({}, d, record) as Receipt;
      }
      if (userId()) record.userId = userId();
      await S.saveReceipt(record);
      await Sync.pushOne(record);
      activityLog("draft_saved", { number: record.number });
      lastSaved.current = record.id;
      setEditingId(record.id);
      toast("Draft saved. Open History to continue later.");
    } catch {
      toast("Unable to save draft.", "error");
    }
  }

  async function sendSaved() {
    if (!lastSaved.current) { toast("Save the receipt first, then send it.", "error"); return; }
    const rec = await S.getReceipt(lastSaved.current);
    openShare(rec);
  }

  async function downloadPdf(el: HTMLDivElement | null) {
    if (!el) return;
    setPdfBusy(true);
    try {
      await pdfDownload(el, fr.current.number || "receipt");
      toast("Receipt downloaded");
      track("receipt_downloaded", { page: "generator" });
    } catch {
      report("pdf failed", "pdf");
      toast("PDF library is still loading. Try again in a moment.", "error");
    } finally { setPdfBusy(false); }
  }
  function print(el: HTMLDivElement | null) {
    printElement(el);
    track("receipt_printed", { page: "generator" });
  }

  function onCustName(v: string) {
    const hit = customers[v.trim().toLowerCase()];
    if (hit && (hit.phone || hit.phoneCountry || hit.email)) {
      const patch: Partial<FormState> = { custName: v };
      if (hit.phone || hit.phoneCountry) { const sp = splitStored(hit.phone || "", hit.phoneCountry || "", fr.current.custIso); patch.custPhone = sp.value; patch.custIso = sp.iso; }
      if (hit.email) patch.custEmail = hit.email;
      update(patch);
    } else update({ custName: v });
  }

  const cur = f.currency;
  const extrasSet = !!(Number(f.discount) || Number(f.taxPct) || Number(f.shipping));
  const extrasSummary = [Number(f.discount) ? "Discount " + money(f.discount, cur) : "", Number(f.taxPct) ? "Tax " + f.taxPct + "%" : "", Number(f.shipping) ? "Delivery " + money(f.shipping, cur) : ""].filter(Boolean).join(" · ");

  const previewActions = (ref: React.RefObject<HTMLDivElement | null>) => (
    <div className="grid grid-cols-3 gap-2">
      <Button variant="secondary" size="sm" onClick={() => downloadPdf(ref.current)} busy={pdfBusy}><IconDownload className="size-4" />PDF</Button>
      <Button variant="secondary" size="sm" onClick={() => print(ref.current)}><IconPrint className="size-4" />Print</Button>
      <Button variant="secondary" size="sm" onClick={sendSaved}><IconShare className="size-4" />Send</Button>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-8">
      <div className="min-w-0">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[1.625rem] font-bold tracking-tight md:text-[1.875rem]">{editingId ? "Edit receipt" : "New receipt"}</h1>
            <p className="text-sm text-muted">Fill in the sale. The receipt updates as you type.</p>
          </div>
          <ButtonLink href="/records" variant="ghost" size="sm" className="hidden sm:inline-flex"><IconList className="size-4" />Receipts</ButtonLink>
        </div>
        {editingId ? <div className="mb-4 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900" role="status">Editing this receipt will update the saved record.</div> : null}

        <form id="receiptForm" onSubmit={(e) => e.preventDefault()} className={cx("space-y-4 transition-opacity duration-150 motion-reduce:transition-none", shown ? "opacity-100" : "invisible opacity-0")} aria-busy={!booted}>
          {/* Business */}
          <Card className="p-4 sm:p-5">
            {!bizOpen && f.bizName ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {f.logo ? <img src={f.logo} alt="" className="size-10 shrink-0 rounded-lg border border-line object-contain" /> : <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-light font-bold text-brand-deep" aria-hidden="true">{f.bizName.charAt(0).toUpperCase()}</span>}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">From</p>
                    <p className="truncate font-bold">{f.bizName}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setBizOpen(true)} aria-expanded={false}><IconEdit className="size-4" />Edit</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div><h2 className="text-[17px] font-semibold">Your business</h2><p className="text-sm text-muted">Saved for your next receipts.</p></div>
                  {f.bizName ? <Button variant="ghost" size="sm" onClick={() => setBizOpen(false)} aria-expanded={true}>Done</Button> : null}
                </div>
                <Field label="Business name" id="bizName"><Input id="bizName" autoComplete="organization" value={f.bizName} onChange={(e) => update({ bizName: e.target.value })} placeholder="e.g. Mama Tobi Foods" /></Field>
                {!bizMore ? (
                  <button type="button" onClick={() => setBizMore(true)} className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-brand"><IconPlus className="size-4" />Add logo, address and more</button>
                ) : (
                  <div className="space-y-4">
                    <Field label="Business address" id="bizAddress"><Textarea id="bizAddress" rows={2} className="min-h-16" value={f.bizAddress} onChange={(e) => update({ bizAddress: e.target.value })} /></Field>
                    <div className="grid gap-4 2xl:grid-cols-2">
                      <PhoneField id="bizPhone" label="Phone" value={f.bizPhone} iso={f.bizIso} onChange={(v, iso) => update({ bizPhone: v, bizIso: iso })} />
                      <Field label="Email" id="bizEmail"><Input id="bizEmail" type="email" inputMode="email" value={f.bizEmail} onChange={(e) => update({ bizEmail: e.target.value })} /></Field>
                    </div>
                    <Field label="Website" id="bizWebsite"><Input id="bizWebsite" type="url" inputMode="url" value={f.bizWebsite} onChange={(e) => update({ bizWebsite: e.target.value })} /></Field>
                    <Field label="Receipt footer message" id="bizFooter"><Input id="bizFooter" placeholder="Thank you for your business." value={f.bizFooter} onChange={(e) => update({ bizFooter: e.target.value })} /></Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Receipt number prefix" id="prefix"><Input id="prefix" value={f.prefix} onChange={(e) => update({ prefix: e.target.value })} /></Field>
                      <Field label="Default tax %" id="taxDefault"><Input id="taxDefault" type="number" inputMode="decimal" min={0} step="0.01" placeholder="0" value={f.taxDefault} onChange={(e) => update({ taxDefault: e.target.value })} /></Field>
                    </div>
                    <div>
                      <p className="mb-1.5 text-sm font-semibold">Business logo</p>
                      <div className="flex flex-wrap items-center gap-3">
                        {f.logo ? <img src={f.logo} alt="Current logo" className="size-14 rounded-xl border border-line object-contain" /> : null}
                        <input ref={logoInput} id="logoFile" type="file" accept="image/*" className="sr-only" onChange={(e) => onLogo(e.target.files ? e.target.files[0] : undefined)} />
                        <Button variant="secondary" size="sm" onClick={() => logoInput.current?.click()}><IconImage className="size-4" />{f.logo ? "Change logo" : "Upload logo"}</Button>
                        {f.logo ? <Button variant="ghost" size="sm" onClick={() => { update({ logo: "" }); if (logoInput.current) logoInput.current.value = ""; }}>Remove logo</Button> : null}
                      </div>
                      {logoError ? <p className="mt-1 text-sm font-semibold text-danger" role="status">{logoError}</p> : null}
                    </div>
                  </div>
                )}
                <Button variant="secondary" size="sm" onClick={saveBizSettings}><IconCheck className="size-4" />Save business settings</Button>
              </div>
            )}
          </Card>

          {/* Items */}
          <Card className="p-4 sm:p-5">
            <h2 className="mb-3 text-[17px] font-semibold">Items</h2>
            {editLock.amounts ? <p className="mb-3 rounded-xl bg-bg px-3 py-2 text-sm text-muted" id="amountsLockNote">Items and amounts are fixed because payments have been recorded on this receipt.</p> : null}
            <fieldset disabled={editLock.amounts} className="min-w-0 disabled:opacity-70">
            <ul className="space-y-3">
              {f.items.map((it, i) => {
                const total = (data.items && data.items[i] && data.items[i].total) || 0;
                return (
                  <li key={it.key} className="rounded-2xl border border-line bg-bg/60 p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <label htmlFor={"item-name-" + it.key} className="sr-only">Item or service name</label>
                        <Input id={"item-name-" + it.key} value={it.name} placeholder={"Item " + (i + 1) + " (e.g. Jollof rice)"} onChange={(e) => setItem(it.key, { name: e.target.value })} />
                      </div>
                      <button type="button" onClick={() => removeItem(it.key)} aria-label={"Delete item " + (i + 1)} className="press inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-danger-bg hover:text-danger"><IconTrash className="size-5" /></button>
                    </div>
                    <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                      <div>
                        <span className="mb-1 block text-xs font-semibold text-muted" id={"qty-l-" + it.key}>Qty</span>
                        <div className="flex items-center rounded-[11px] border border-line bg-white transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/20" role="group" aria-labelledby={"qty-l-" + it.key}>
                          <button type="button" onClick={() => step(it, -1)} aria-label="Decrease quantity" className="press inline-flex size-11 items-center justify-center text-slate-600"><IconMinus className="size-4" /></button>
                          <input aria-label="Quantity" type="number" inputMode="decimal" min={0} step={1} value={it.qty} onChange={(e) => setItem(it.key, { qty: e.target.value })}
                            className="tabular h-11 w-12 border-0 bg-transparent text-center font-semibold focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                          <button type="button" onClick={() => step(it, 1)} aria-label="Increase quantity" className="press inline-flex size-11 items-center justify-center text-slate-600"><IconPlus className="size-4" /></button>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={"item-price-" + it.key} className="mb-1 block text-xs font-semibold text-muted">Unit price</label>
                        <Input id={"item-price-" + it.key} type="number" inputMode="decimal" min={0} step="0.01" className="tabular" value={it.price === "0" ? "" : it.price} placeholder="0.00" onChange={(e) => setItem(it.key, { price: e.target.value })} />
                      </div>
                      <p className="col-span-2 text-right text-sm text-muted sm:col-span-1 sm:pb-3">Total <span className="tabular font-bold text-ink">{money(total, cur)}</span></p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Button variant="secondary" className="mt-3" block onClick={addItem}><IconPlus className="size-4" />Add item</Button>
            </fieldset>
          </Card>

          {/* Customer */}
          <Card className="p-4 sm:p-5">
            <h2 className="text-[17px] font-semibold">Customer <span className="text-sm font-semibold text-muted">(optional)</span></h2>
            <div className="mt-3 space-y-4">
              <Field label="Customer name" id="custName" hint={Object.keys(customers).length ? "Pick a previous customer to fill phone and email." : undefined}>
                <Input id="custName" list="custNameList" autoComplete="off" value={f.custName} onChange={(e) => onCustName(e.target.value)} />
                <datalist id="custNameList">{Object.values(customers).map((c) => c && c.name ? <option key={c.name} value={c.name} /> : null)}</datalist>
              </Field>
              <div className="grid gap-4 2xl:grid-cols-2">
                <PhoneField id="custPhone" label="Customer phone" value={f.custPhone} iso={f.custIso} onChange={(v, iso) => update({ custPhone: v, custIso: iso })} />
                <Field label="Customer email" id="custEmail"><Input id="custEmail" type="email" inputMode="email" value={f.custEmail} onChange={(e) => update({ custEmail: e.target.value })} /></Field>
              </div>
            </div>
          </Card>

          {/* Payment */}
          <Card className="space-y-4 p-4 sm:p-5">
            <h2 className="text-[17px] font-semibold">Payment</h2>
            <ChipGroup name="paymentMethod" label="Payment method" value={f.payment} options={PAY_METHODS} onChange={(v) => update({ payment: v })} />
            <ChipGroup name="paymentStatus" label="Payment status" value={f.status} options={STATUSES} disabled={editLock.pay} onChange={(v) => update({ status: v, paid: v === "PARTIALLY PAID" ? "" : f.paid })} />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Amount paid" id="amountPaid">
                <Input id="amountPaid" type="number" inputMode="decimal" min={0} step="0.01" readOnly={locked || editLock.pay} aria-readonly={locked || editLock.pay} className="tabular" value={locked ? effectivePaid(f) : f.paid} onChange={(e) => update({ paid: e.target.value })} />
              </Field>
              <div>
                <span className="mb-1.5 block text-sm font-semibold">Balance due</span>
                <output id="balanceDue" className={cx(inputClass, "tabular flex min-h-11 items-center bg-slate-50 font-bold")}>{money(data.balance, cur)}</output>
              </div>
            </div>
            {hint ? <p className="text-sm font-semibold text-danger" role="status" id="statusHint">{hint}</p> : null}
            {editLock.pay && editingId ? (
              <div className="rounded-2xl border border-warn/30 bg-warn-bg/60 px-4 py-3 text-sm text-[#7c2d12]" id="payLockNote" role="note">
                <p className="font-semibold">Payments are recorded separately</p>
                {editLock.owing
                  ? <p className="mt-0.5">To add money received, open this receipt in Receipt history and tap <strong>Record payment</strong>. That keeps a clear payment history and updates the balance for you.</p>
                  : <p className="mt-0.5">This receipt was paid through its payment history. To fix a wrong payment, open it in Receipt history and use <strong>Undo last payment</strong>.</p>}
                <Link href={"/records?view=" + encodeURIComponent(editingId)} className="mt-1 inline-flex min-h-11 items-center font-semibold text-brand underline-offset-2 hover:underline">{editLock.owing ? "Go to Record payment" : "Open payment history"}</Link>
              </div>
            ) : null}

            <div className="rounded-2xl border border-line">
              <button type="button" onClick={() => setExtrasOpen((v) => !v)} aria-expanded={extrasOpen} aria-controls={extrasOpen ? "extras" : undefined}
                className="flex min-h-12 w-full items-center justify-between gap-2 px-4 text-left">
                <span><span className="font-semibold">Discount, tax &amp; delivery</span>{!extrasOpen && extrasSet ? <span className="block text-sm text-muted">{extrasSummary}</span> : null}</span>
                <IconChevronDown className={cx("size-5 text-muted transition-transform", extrasOpen && "rotate-180")} />
              </button>
              {extrasOpen ? (
                <div id="extras" className="grid grid-cols-2 gap-4 border-t border-line p-4 sm:grid-cols-3">
                  <Field label="Discount" id="discount"><Input id="discount" disabled={editLock.amounts} type="number" inputMode="decimal" min={0} step="0.01" className="tabular" value={f.discount} onChange={(e) => update({ discount: e.target.value })} /></Field>
                  <Field label="Tax %" id="taxPct"><Input id="taxPct" disabled={editLock.amounts} type="number" inputMode="decimal" min={0} step="0.01" className="tabular" value={f.taxPct} onChange={(e) => update({ taxPct: e.target.value })} /></Field>
                  <Field label="Delivery / shipping" id="shipping" className="col-span-2 sm:col-span-1"><Input id="shipping" disabled={editLock.amounts} type="number" inputMode="decimal" min={0} step="0.01" className="tabular" value={f.shipping === "0" ? "" : f.shipping} placeholder="0" onChange={(e) => update({ shipping: e.target.value })} /></Field>
                </div>
              ) : null}
            </div>
          </Card>

          {/* Receipt details */}
          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[17px] font-semibold">Receipt details</h2>
                {!detailsOpen ? <p className="truncate text-sm text-muted tabular">{[f.number || "Number on save", niceDate(f.date), f.time, cur].filter(Boolean).join(" · ")}</p> : null}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDetailsOpen((v) => !v)} aria-expanded={detailsOpen} aria-controls={detailsOpen ? "details" : undefined}>{detailsOpen ? "Done" : <><IconEdit className="size-4" />Edit</>}</Button>
            </div>
            {detailsOpen ? (
              <div id="details" className="mt-4 grid grid-cols-2 gap-4">
                <Field label="Receipt number" id="receiptNo" className="col-span-2 sm:col-span-1"><Input id="receiptNo" value={f.number} onChange={(e) => update({ number: e.target.value })} /></Field>
                <Field label="Currency" id="currency" className="col-span-2 sm:col-span-1">
                  <Select id="currency" disabled={editLock.amounts} value={f.currency} onChange={(e) => update({ currency: e.target.value })}>{CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select>
                </Field>
                <Field label="Date" id="receiptDate"><Input id="receiptDate" type="date" value={f.date} onChange={(e) => update({ date: e.target.value })} /></Field>
                <Field label="Time" id="receiptTime"><Input id="receiptTime" type="time" value={f.time} onChange={(e) => update({ time: e.target.value })} /></Field>
              </div>
            ) : null}
          </Card>

          {/* Notes */}
          <Card className="p-4 sm:p-5">
            <Field label={<span className="text-[17px] font-semibold">Notes <span className="text-sm font-semibold text-muted">(optional)</span></span>} id="notes">
              <Textarea id="notes" rows={3} placeholder="Thank you message, delivery note, account details…" value={f.notes} onChange={(e) => update({ notes: e.target.value })} />
            </Field>
          </Card>

          <div className="hidden items-center gap-2 lg:flex">
            <Button size="lg" onClick={saveReceipt} busy={saving}>{saving ? "Saving…" : "Save receipt"}</Button>
            <Button variant="ghost" onClick={saveDraft}>Save draft</Button>
          </div>
          <p className="text-sm text-muted">Saved receipts appear in Receipts. {userId() ? "" : "Log in to keep them across devices."}</p>
          <div className="lg:hidden"><Button variant="ghost" size="sm" onClick={saveDraft}>Save as draft</Button></div>
        </form>
      </div>

      {/* Desktop live preview */}
      <aside className="hidden lg:block" aria-label="Receipt preview">
        <div className="sticky top-24 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-muted">Live preview</p>
            <Button variant="ghost" size="sm" onClick={() => setTemplatesOpen(true)}>Template: {templateLabel(f.template)}</Button>
          </div>
          <div className="max-h-[calc(100dvh-15rem)] overflow-auto rounded-2xl border border-line bg-white p-3 shadow-soft">
            <ReceiptPaper ref={previewDesk} record={data} id="receiptPreview" />
          </div>
          {previewActions(previewDesk)}
        </div>
      </aside>

      {/* Mobile sticky action bar (sits above the tab bar) */}
      <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden print:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-muted">Total</p>
            <p className="tabular truncate text-lg font-bold leading-tight">{money(data.grand, cur)}</p>
          </div>
          <Button variant="secondary" onClick={() => setPreviewOpen(true)}><IconEye className="size-5" />Preview</Button>
          <Button onClick={saveReceipt} busy={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Preview" size="xl"
        footer={<div className="space-y-2">{previewActions(previewSheet)}<Button block size="lg" onClick={saveReceipt} busy={saving}>Save receipt</Button></div>}>
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Template">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={t.id === f.template} onClick={() => pickTemplate(t.id)}
              className={cx("press min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold", t.id === f.template ? "border-brand bg-brand text-white" : "border-line bg-white")}>{t.name}</button>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border border-line"><ReceiptPaper ref={previewSheet} record={data} /></div>
      </Modal>

      <Modal open={templatesOpen} onClose={() => setTemplatesOpen(false)} title="Choose a template" size="lg">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" aria-pressed={t.id === f.template} onClick={() => pickTemplate(t.id)}
              className={cx("press min-h-14 rounded-2xl border px-3 text-left font-semibold", t.id === f.template ? "border-brand bg-brand-50 text-brand-deep ring-2 ring-brand/30" : "border-line hover:border-brand")}>{t.name}</button>
          ))}
        </div>
      </Modal>

      <SavedDialog saved={saved} onClose={() => setSaved(null)} />
    </div>
  );
}

function SavedDialog({ saved, onClose }: { saved: { record: Receipt; text: string } | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const rec = saved && saved.record;
  const action = (icon: ReactNode, label: string, onClick: () => void, primary?: boolean) => (
    <Button variant={primary ? "primary" : "secondary"} onClick={onClick} block busy={busy && label === "Download image"}>{icon}{label}</Button>
  );
  return (
    <Modal open={!!saved} onClose={onClose} title="Receipt saved ✓" size="sm">
      {rec ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-ok-bg p-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-ok text-white"><IconCheck className="size-5" /></span>
            <div className="min-w-0"><p className="font-bold tabular">{rec.number}</p><p className="tabular text-sm text-[#065f46]">{money(rec.grand, rec.currency)}</p></div>
          </div>
          <p className="text-[15px] text-muted">{saved!.text}</p>
          <div className="grid gap-2">
            {action(<IconShare className="size-5" />, "Send to customer", () => { onClose(); openShare(rec); }, true)}
            {action(<IconDownload className="size-5" />, "Download image", async () => {
              setBusy(true);
              try { await downloadImage(rec); } catch { toast("Unable to download right now. Try again.", "error"); } finally { setBusy(false); }
            })}
            {action(<IconEye className="size-5" />, "View receipt", () => { location.href = "/records?view=" + encodeURIComponent(rec.id); })}
            <div className="grid grid-cols-2 gap-2">
              <Link href="/records" className="inline-flex min-h-11 items-center justify-center rounded-xl text-[15px] font-semibold text-brand hover:bg-brand-50">All receipts</Link>
              <Button variant="ghost" onClick={onClose}>New receipt</Button>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
