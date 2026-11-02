/* eslint-disable @typescript-eslint/no-explicit-any */
import { configured, getClient } from "./cloud";
import { userId } from "./session";
import * as S from "./storage";
import { updateChip } from "./bus";
import { report } from "./errors";
import type { Receipt } from "./types";

// Port of js/sync.js — same tables, columns, conflict rules and messages.
let busy = false;
let pendingResync = false;

function sb() { return configured() ? getClient() : null; }
function online() { return typeof navigator === "undefined" || navigator.onLine; }
const chip = updateChip;

function toRow(record: Receipt, user: string) {
  const payload: any = Object.assign({}, record);
  delete payload.payload;
  return {
    id: record.id,
    user_id: user,
    receipt_number: record.number,
    customer_name: (record.customer && record.customer.name) || "",
    customer_phone: (record.customer && record.customer.phone) || "",
    customer_email: (record.customer && record.customer.email) || "",
    subtotal: Number(record.subtotal) || 0,
    discount: Number(record.discount) || 0,
    tax: Number(record.tax) || 0,
    tax_pct: Number(record.taxPct) || 0,
    total: Number(record.grand) || 0,
    amount_paid: Number(record.paid) || 0,
    outstanding: Number(record.balance) || 0,
    payment_status: record.status || "UNPAID",
    payment_method: record.payment || "Cash",
    currency: record.currency || "NGN",
    template_id: record.template || "classic",
    receipt_date: record.date || null,
    receipt_time: record.time || "",
    notes: record.notes || "",
    payload,
    created_at: record.createdAt || new Date().toISOString(),
    updated_at: record.updatedAt || new Date().toISOString(),
    deleted_at: record.deletedAt || null,
  };
}

function fromRow(row: any): Receipt {
  const rec: any = row.payload && typeof row.payload === "object" ? Object.assign({}, row.payload) : {};
  rec.id = row.id;
  rec.number = row.receipt_number || rec.number;
  rec.userId = row.user_id;
  rec.syncStatus = "synced";
  rec.updatedAt = row.updated_at;
  rec.createdAt = row.created_at;
  rec.status = row.payment_status || rec.status;
  rec.grand = row.total != null ? Number(row.total) : rec.grand;
  rec.paid = row.amount_paid != null ? Number(row.amount_paid) : rec.paid;
  rec.balance = row.outstanding != null ? Number(row.outstanding) : rec.balance;
  rec.template = row.template_id || rec.template;
  rec.currency = row.currency || rec.currency;
  rec.date = row.receipt_date || rec.date;
  if (!rec.customer) rec.customer = { name: row.customer_name || "", phone: row.customer_phone || "", email: row.customer_email || "" };
  rec.deletedAt = row.deleted_at || null;
  return rec;
}

function isNumberConflict(err: any) {
  if (!err) return false;
  const c = String(err.code || "");
  const m = String(err.message || "") + " " + String(err.details || "") + " " + String(err.hint || "");
  return c === "23505" || /duplicate key|receipts_user_number_uidx|unique constraint.*receipt_number/i.test(m);
}

function numberPrefix(number: string, fallback: string) {
  const m = String(number || "").match(/^(.*?)(\d+)$/);
  if (m && m[1]) return m[1];
  return fallback || "RCT-";
}

export async function allocateReceiptNumber(prefix: string): Promise<string> {
  const pref = prefix || "RCT-";
  const localMax = Number(await S.catchUpSequence(null, pref)) || 0;
  const client = sb();
  if (client) {
    try {
      const res = await client.rpc("allocate_receipt_number", { p_prefix: pref });
      if (!res.error && res.data) {
        const remote = S.parseSeqFromNumber(String(res.data), pref);
        if (remote > localMax) {
          await S.catchUpSequence([String(res.data)], pref);
          return String(res.data);
        }
      }
    } catch { /* local fallback */ }
  }
  const seq = await S.nextNumber();
  return S.formatNumber(seq, pref);
}

/** Generator listens to this to refresh its suggested receipt number. */
export const SEQUENCE_EVENT = "receiptly-sequence";

async function catchUpAfterPull(remote: any[]) {
  const biz = await S.getBusiness();
  const prefix = (biz && biz.prefix) || "RCT-";
  const extra = (remote || []).map((r) => r && r.receipt_number);
  const seq = await S.catchUpSequence(extra, prefix);
  try { document.dispatchEvent(new CustomEvent(SEQUENCE_EVENT, { detail: { seq, prefix } })); } catch { /* ignore */ }
  return seq;
}

function syncFailureMessage(err: any) {
  const code = String((err && err.code) || "");
  const msg = String((err && (err.message || err.details)) || err || "");
  if (/Failed to fetch|NetworkError|network|offline/i.test(msg)) return "Unable to reach Receipt Pilot cloud right now. Your receipt is still saved on this device.";
  if (code === "42501" || /row-level security|permission denied|not authorized/i.test(msg)) return "Cloud sync is blocked for this account. Check that your trial or subscription is active, then try again. Your receipt is still saved on this device.";
  if (code === "23505" || /receipt_number_conflict|duplicate key|unique constraint/i.test(msg)) return "This receipt number is already used in your account. Receipt Pilot will retry with a new number. Your receipt is still saved on this device.";
  if (code === "23502" || /null value in column/i.test(msg)) return "A required receipt field is missing, so cloud sync was skipped. Your receipt is still saved on this device.";
  return "Unable to sync right now. Your receipt is still saved on this device.";
}

async function upsertItems(client: any, record: Receipt, user: string) {
  const deleted = await client.from("receipt_items").delete().eq("receipt_id", record.id);
  if (deleted.error) throw deleted.error;
  const items = Array.isArray(record.items) ? record.items : [];
  if (!items.length) return;
  const rows = items.map((it, i) => ({
    receipt_id: record.id, user_id: user, name: it.name || "", quantity: Number(it.qty) || 0,
    unit_price: Number(it.price) || 0, line_total: Number(it.total) || 0, sort_order: i,
  }));
  const res = await client.from("receipt_items").insert(rows);
  if (res.error) throw res.error;
}

export async function pushOne(record: Receipt): Promise<boolean> {
  const client: any = sb();
  const user = userId();
  if (!client || !user || !online()) {
    chip("Saved offline. It will sync when you're back online.", true);
    return false;
  }
  try {
    const existing = await client.from("receipts").select("id, updated_at, receipt_number").eq("id", record.id).maybeSingle();
    if (existing.data) {
      if (existing.data.receipt_number) record.number = existing.data.receipt_number;
      if (existing.data.updated_at && record.updatedAt && existing.data.updated_at > record.updatedAt) {
        if (record.syncStatus === "pending") return false;
        return true;
      }
      const lockedUp = await client.from("receipts").upsert(toRow(record, user), { onConflict: "id" });
      if (lockedUp.error) throw lockedUp.error;
      await upsertItems(client, record, user);
      await S.putReceiptSynced(Object.assign({}, record, { userId: user }));
      return true;
    }
    let attempts = 0;
    while (attempts < 6) {
      const up = await client.from("receipts").upsert(toRow(record, user), { onConflict: "id" });
      if (!up.error) {
        await upsertItems(client, record, user);
        await S.putReceiptSynced(Object.assign({}, record, { userId: user }));
        return true;
      }
      if (!isNumberConflict(up.error)) throw up.error;
      const biz = await S.getBusiness();
      const prefix = numberPrefix(record.number, (biz && biz.prefix) || "RCT-");
      let next = await allocateReceiptNumber(prefix);
      if (!next || next === record.number) {
        const seq = await S.nextNumber();
        next = S.formatNumber(seq, prefix);
      }
      record.number = next;
      record.updatedAt = new Date().toISOString();
      record.syncStatus = "pending";
      record.userId = user;
      await S.saveReceipt(record);
      await S.catchUpSequence([next], prefix);
      attempts += 1;
    }
    throw new Error("receipt_number_conflict");
  } catch (e: any) {
    console.warn("Receipt Pilot push failed:", (e && e.message) || e);
    record.syncStatus = "pending";
    record.userId = user;
    try { await S.saveReceipt(record); } catch { /* local copy already exists */ }
    chip(syncFailureMessage(e), true);
    report((e && e.message) || "push", "sync");
    return false;
  }
}

async function pushTombstones() {
  const client: any = sb();
  const user = userId();
  if (!client || !user) return;
  const stones = await S.listTombstones();
  for (let i = 0; i < stones.length; i++) {
    const id = stones[i].id;
    const rec = await S.getReceipt(id);
    if (rec && rec.userId !== user) continue;
    if (rec && !rec.userId) continue;
    const res = await client.from("receipts")
      .update({ deleted_at: stones[i].deletedAt || new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id).eq("user_id", user);
    if (!res.error) await S.clearTombstone(id);
  }
}

async function pullReceipts() {
  const client: any = sb();
  const user = userId();
  if (!client || !user) return;
  const res = await client.from("receipts").select("*").eq("user_id", user);
  if (res.error) throw res.error;
  const remote = res.data || [];
  for (let i = 0; i < remote.length; i++) {
    const row = remote[i];
    if (row.deleted_at) {
      const deletedRec = fromRow(row);
      deletedRec.deletedAt = row.deleted_at;
      deletedRec.syncStatus = "synced";
      await S.putReceiptSynced(deletedRec);
      await S.clearTombstone(row.id);
      continue;
    }
    const rec = fromRow(row);
    const local = await S.getReceipt(rec.id);
    if (local && local.syncStatus === "pending") {
      if (local.updatedAt && rec.updatedAt && rec.updatedAt > local.updatedAt) continue;
      await pushOne(local);
    } else if (!local || !local.updatedAt || (rec.updatedAt || "") >= local.updatedAt) {
      await S.putReceiptSynced(rec);
    }
  }
  await catchUpAfterPull(remote);
}

export async function pushBusiness() {
  const client: any = sb();
  const user = userId();
  if (!client || !user || !online()) return;
  const biz = await S.getBusiness();
  if (!biz || biz.syncStatus !== "pending") return;
  const row = {
    user_id: user, business_name: biz.name || "", address: biz.address || "", phone: biz.phone || "",
    email: biz.email || "", website: biz.website || "", logo: biz.logo || "", footer: biz.footer || "",
    prefix: biz.prefix || "RCT-", currency: biz.currency || "NGN", updated_at: new Date().toISOString(),
  };
  const res = await client.from("business_information").upsert(row, { onConflict: "user_id" });
  if (res.error) throw res.error;
  if (biz.template) {
    await client.from("user_settings").upsert({ user_id: user, default_template: biz.template, currency: biz.currency || "NGN", updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  }
  await S.putBusinessSynced(Object.assign({}, biz, { updatedAt: row.updated_at }));
}

async function pullBusiness() {
  const client: any = sb();
  const user = userId();
  if (!client || !user) return;
  const bizRes = await client.from("business_information").select("*").eq("user_id", user).maybeSingle();
  const setRes = await client.from("user_settings").select("*").eq("user_id", user).maybeSingle();
  const local = await S.getBusiness();
  const remote = bizRes.data;
  if (remote) {
    const remoteEmpty = !(remote.business_name || remote.address || remote.phone || remote.email || remote.website || remote.logo);
    const localFilled = !!(local && (local.name || local.address || local.phone || local.email || local.website || local.logo));
    const localNewer = local && local.updatedAt && remote.updated_at && local.updatedAt > remote.updated_at && local.syncStatus === "pending";
    if (remoteEmpty && localFilled) return;
    if (!localNewer) {
      await S.putBusinessSynced({
        name: remote.business_name, address: remote.address, phone: remote.phone, email: remote.email,
        website: remote.website, logo: remote.logo, prefix: remote.prefix, currency: remote.currency,
        footer: remote.footer || (local && local.footer) || "",
        template: (setRes.data && setRes.data.default_template) || (local && local.template) || "classic",
        updatedAt: remote.updated_at,
      });
    }
  }
}

async function pushPending() {
  const pending = await S.listPendingReceipts();
  const user = userId();
  if (!user) return;
  for (const rec of pending) {
    if (!rec.userId || rec.userId !== user) continue;
    await pushOne(rec);
  }
}

export async function sync(): Promise<void> {
  if (busy) { pendingResync = true; return; }
  if (!sb() || !userId()) return;
  if (!online()) { chip("Offline — Changes saved on this device", true); return; }
  const startedUid = userId();
  if (!startedUid) return;
  busy = true;
  pendingResync = false;
  let failed: any = null;
  const stillMine = () => userId() === startedUid;
  async function step(name: string, fn: () => Promise<void>) {
    if (!stillMine()) return;
    try { await fn(); } catch (e: any) {
      failed = e;
      console.warn("Receipt Pilot sync step failed (" + name + "):", (e && e.message) || e);
      report((e && e.message) || name, "sync");
    }
  }
  try {
    await step("tombstones", pushTombstones);
    await step("pushPending", pushPending);
    await step("pullReceipts", pullReceipts);
    await step("pushBusiness", pushBusiness);
    await step("pullBusiness", pullBusiness);
    if (!stillMine()) pendingResync = true;
    else if (failed) chip("Unable to sync right now. Your receipt is still saved on this device.", true);
    else {
      let leftover: Receipt[] = [];
      try { leftover = await S.listPendingReceipts(); } catch { leftover = []; }
      const user = userId();
      const stillPending = (leftover || []).some((rec) => {
        if (!rec || rec.syncStatus !== "pending") return false;
        if (!user) return !rec.userId;
        return rec.userId === user;
      });
      if (stillPending) chip("Some changes are still waiting to sync.", true);
      else chip("Records synchronized successfully.");
    }
  } finally {
    busy = false;
    if (pendingResync && userId() && online()) {
      pendingResync = false;
      Promise.resolve(sync()).catch(() => {});
    }
  }
}

export async function remove(id: string) {
  let rec = await S.getReceipt(id);
  if (rec && !rec.deletedAt) await S.trashReceipt(id);
  rec = await S.getReceipt(id);
  if (rec) await pushOne(rec);
}

export async function restore(id: string) {
  await S.restoreReceipt(id);
  const rec = await S.getReceipt(id);
  if (rec) await pushOne(rec);
}

export async function purge(id: string) {
  const user = userId();
  const client: any = sb();
  await S.purgeReceipt(id);
  if (client && user && online()) {
    try { await client.from("receipts").delete().eq("id", id).eq("user_id", user); } catch { /* local already gone */ }
  }
}

export async function restoreAll() {
  const user = userId();
  if (!user) return { ok: false, needAuth: true };
  const rows = await S.getTrashedReceipts();
  for (const r of rows) await restore(r.id);
  return { ok: true, count: rows.length };
}
