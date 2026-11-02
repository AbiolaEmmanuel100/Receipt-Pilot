/* eslint-disable @typescript-eslint/no-explicit-any */
import { userId as currentUid } from "./session";
import { uid as newUid } from "./val";
import type { Business, Receipt } from "./types";

// Port of js/storage.js. Same IndexedDB name, version, stores and meta keys,
// so receipts saved by the current site are read by the new one (and back).
const DB_NAME = "receiptly_db";
const DB_VERSION = 2;
let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e: any) => {
      const db: IDBDatabase = e.target.result;
      const tx: IDBTransaction = e.target.transaction;
      if (!db.objectStoreNames.contains("receipts")) {
        const store = db.createObjectStore("receipts", { keyPath: "id" });
        store.createIndex("number", "number", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("date", "date", { unique: false });
        store.createIndex("status", "status", { unique: false });
      } else if (e.oldVersion < 2) {
        const existing = tx.objectStore("receipts");
        try { existing.deleteIndex("number"); } catch { /* ignore */ }
        try { existing.createIndex("number", "number", { unique: false }); } catch { /* ignore */ }
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      if (!db.objectStoreNames.contains("tombstones")) db.createObjectStore("tombstones", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqToPromise<T = any>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone<T>(tx: IDBTransaction, value: T): Promise<T> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMeta<T = any>(key: string, fallback: T): Promise<T> {
  const db = await openDb();
  const row = await reqToPromise(db.transaction("meta", "readonly").objectStore("meta").get(key));
  return row ? row.value : fallback;
}

export async function setMeta<T>(key: string, value: T): Promise<T> {
  const db = await openDb();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key, value });
  return txDone(tx, value);
}

function sequenceKey() {
  const uid = currentUid();
  return uid ? "sequence:" + uid : "sequence";
}

export async function nextNumber(): Promise<number> {
  const seq = await peekNumber();
  const next = Number(seq) + 1;
  await setMeta(sequenceKey(), next);
  return next;
}

export async function peekNumber(): Promise<number> {
  const biz = await getBusiness();
  return catchUpSequence(null, (biz && biz.prefix) || "RCT-");
}

export function formatNumber(seq: number, prefix?: string) {
  const p = prefix || "RCT-";
  return p + String(seq).padStart(6, "0");
}

export function parseSeqFromNumber(number: unknown, prefix?: string): number {
  const n = String(number == null ? "" : number);
  const p = String(prefix == null || prefix === "" ? "RCT-" : prefix);
  if (p && n.indexOf(p) === 0) {
    const rest = n.slice(p.length);
    if (/^[0-9]+$/.test(rest)) return parseInt(rest, 10) || 0;
  }
  const m = n.match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) || 0 : 0;
}

export async function catchUpSequence(extraNumbers?: string[] | null, prefix?: string): Promise<number> {
  const uid = currentUid();
  const p = prefix ? prefix : ((await getBusiness()).prefix || "RCT-");
  const [cur, rows] = await Promise.all([getMeta(sequenceKey(), 0), getAllRows()]);
  const current = Number(cur) || 0;
  let max = current;
  (rows || []).forEach((r) => {
    if (!r) return;
    if (uid) { if (r.userId !== uid) return; } else if (r.userId) return;
    const num = r.number || (r.payload && r.payload.number) || "";
    if (!num) return;
    const v = parseSeqFromNumber(num, p);
    if (v > max) max = v;
  });
  (extraNumbers || []).forEach((num) => {
    const v = parseSeqFromNumber(num, p);
    if (v > max) max = v;
  });
  if (max > current) await setMeta(sequenceKey(), max);
  return max;
}

export function emptyBusiness(): Business {
  return { name: "", address: "", phone: "", email: "", website: "", logo: "", prefix: "RCT-", footer: "", currency: "NGN", template: "classic", taxPct: "" };
}

export function businessFilled(biz: Partial<Business> | null | undefined) {
  return !!(biz && (biz.name || biz.address || biz.phone || biz.email || biz.website || biz.logo));
}

export async function adoptGuestBusinessIfNeeded() {
  const uid = currentUid();
  if (!uid) return null;
  const owned = await getMeta<Business | null>("business:" + uid, null);
  return owned || emptyBusiness();
}

export async function adoptGuestReceiptsIfNewAccount() {
  // Do not silently stamp unowned receipts onto this account (see account.ts maybeClaimLocal).
  return false;
}

function businessMetaKey() {
  const uid = currentUid();
  return uid ? "business:" + uid : "business";
}

export function getBusiness(): Promise<Business> {
  return getMeta<Business>(businessMetaKey(), emptyBusiness());
}

export function saveBusiness(biz: Partial<Business>) {
  const copy: Business = Object.assign({}, emptyBusiness(), biz);
  copy.syncStatus = "pending";
  copy.updatedAt = new Date().toISOString();
  return setMeta(businessMetaKey(), copy);
}

export function putBusinessSynced(biz: Partial<Business>) {
  const copy: Business = Object.assign({}, emptyBusiness(), biz, { syncStatus: "synced" });
  if (!copy.updatedAt) copy.updatedAt = new Date().toISOString();
  return setMeta(businessMetaKey(), copy);
}

export async function saveReceipt(record: Receipt): Promise<Receipt> {
  const row = Object.assign({}, record);
  if (!row.syncStatus || row.syncStatus === "synced") row.syncStatus = "pending";
  if (!row.updatedAt) row.updatedAt = new Date().toISOString();
  const db = await openDb();
  const tx = db.transaction("receipts", "readwrite");
  tx.objectStore("receipts").put(row);
  return txDone(tx, row);
}

export async function putReceiptSynced(record: Receipt): Promise<Receipt> {
  const row = Object.assign({}, record, { syncStatus: "synced" });
  const db = await openDb();
  const tx = db.transaction("receipts", "readwrite");
  tx.objectStore("receipts").put(row);
  return txDone(tx, row);
}

async function getReceiptRaw(id: string): Promise<Receipt | undefined> {
  const db = await openDb();
  return reqToPromise(db.transaction("receipts", "readonly").objectStore("receipts").get(id));
}

function isUnowned(rec: Receipt | null | undefined) {
  return !!(rec && (rec.userId == null || rec.userId === ""));
}

function canAccessReceipt(rec: Receipt | null | undefined) {
  if (!rec) return false;
  const uid = currentUid();
  if (uid) return rec.userId === uid;
  return isUnowned(rec);
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const rec = await getReceiptRaw(id);
  return canAccessReceipt(rec) ? (rec as Receipt) : null;
}

export const TRASH_DAYS = 30;

async function getAllRows(): Promise<Receipt[]> {
  const db = await openDb();
  const rows = await reqToPromise<Receipt[]>(db.transaction("receipts", "readonly").objectStore("receipts").getAll());
  return rows || [];
}

export async function getReceiptByNumber(number: string): Promise<Receipt | null> {
  const rows = await getAllRows();
  return rows.find((r) => r && String(r.number) === String(number) && canAccessReceipt(r)) || null;
}

export async function getReceipts(): Promise<Receipt[]> {
  return (await getAllRows()).filter((r) => r && !r.deletedAt);
}

export async function getVisibleReceipts(): Promise<Receipt[]> {
  return (await getReceipts()).filter(canAccessReceipt);
}

export async function listUnownedReceipts(): Promise<Receipt[]> {
  return (await getReceipts()).filter(isUnowned);
}

export async function getTrashedReceipts(): Promise<Receipt[]> {
  return (await getAllRows()).filter((r) => r && r.deletedAt).filter(canAccessReceipt);
}

export async function listPendingReceipts(): Promise<Receipt[]> {
  return (await getAllRows()).filter((r) => r && r.syncStatus === "pending");
}

export async function addTombstone(id: string) {
  const db = await openDb();
  const tx = db.transaction("tombstones", "readwrite");
  tx.objectStore("tombstones").put({ id, deletedAt: new Date().toISOString() });
  return txDone(tx, undefined);
}

export async function listTombstones(): Promise<{ id: string; deletedAt: string }[]> {
  const db = await openDb();
  if (!db.objectStoreNames.contains("tombstones")) return [];
  const rows = await reqToPromise(db.transaction("tombstones", "readonly").objectStore("tombstones").getAll());
  return rows || [];
}

export async function clearTombstone(id: string) {
  const db = await openDb();
  const tx = db.transaction("tombstones", "readwrite");
  tx.objectStore("tombstones").delete(id);
  return txDone(tx, undefined);
}

export async function trashReceipt(id: string) {
  const rec = await getReceipt(id);
  if (!rec) return;
  rec.deletedAt = new Date().toISOString();
  rec.updatedAt = rec.deletedAt;
  rec.syncStatus = "pending";
  await saveReceipt(rec);
  await addTombstone(id);
}

export async function restoreReceipt(id: string) {
  const rec = await getReceipt(id);
  if (!rec) return;
  rec.deletedAt = null;
  rec.updatedAt = new Date().toISOString();
  rec.syncStatus = "pending";
  await saveReceipt(rec);
  await clearTombstone(id);
}

async function purgeReceiptRaw(id: string) {
  const db = await openDb();
  const tx = db.transaction(["receipts", "tombstones"], "readwrite");
  tx.objectStore("receipts").delete(id);
  tx.objectStore("tombstones").delete(id);
  return txDone(tx, undefined);
}

export async function purgeReceipt(id: string) {
  const rec = await getReceipt(id);
  if (!rec) return;
  await purgeReceiptRaw(id);
}

export function trashAgeDays(rec: Receipt) {
  if (!rec || !rec.deletedAt) return 0;
  return Math.floor((Date.now() - new Date(rec.deletedAt).getTime()) / 86400000);
}

export async function purgeExpiredTrash() {
  const rows = await getTrashedReceipts();
  for (const r of rows) if (trashAgeDays(r) >= TRASH_DAYS) await purgeReceipt(r.id);
}

export async function clearReceipts() {
  const rows = await getAllRows();
  for (const r of rows) {
    if (canAccessReceipt(r)) {
      await purgeReceiptRaw(r.id);
      await addTombstone(r.id);
    }
  }
}

export async function exportAll() {
  const [receipts, sequence, business] = await Promise.all([getVisibleReceipts(), peekNumber(), getBusiness()]);
  return { version: 1, exportedAt: new Date().toISOString(), sequence, business, receipts };
}

export async function importAll(payload: any, mode: "merge" | "replace"): Promise<number> {
  if (!payload || !Array.isArray(payload.receipts)) throw new Error("invalid");
  const uid = currentUid();
  const existing = await getAllRows();
  const byId: Record<string, Receipt> = {};
  (existing || []).forEach((row) => { if (row && row.id) byId[row.id] = row; });
  const db = await openDb();
  const tx = db.transaction(["receipts", "meta"], "readwrite");
  const store = tx.objectStore("receipts");
  if (mode === "replace") (existing || []).forEach((row) => { if (canAccessReceipt(row)) store.delete(row.id); });
  let imported = 0;
  payload.receipts.forEach((src: Receipt) => {
    if (!src || !src.id || !src.number) return;
    const r: Receipt = Object.assign({}, src);
    const present = byId[r.id];
    if (uid) {
      if (present && !canAccessReceipt(present)) r.id = newUid();
      r.userId = uid;
    } else {
      if (r.userId) return;
      if (present && !canAccessReceipt(present)) return;
      r.userId = null;
    }
    r.syncStatus = r.syncStatus || "pending";
    store.put(r);
    byId[r.id] = r;
    imported += 1;
  });
  const meta = tx.objectStore("meta");
  if (payload.sequence != null) {
    meta.get(sequenceKey()).onsuccess = (ev: any) => {
      const cur = ev.target.result && ev.target.result.value;
      const incoming = Number(payload.sequence) || 0;
      meta.put({ key: sequenceKey(), value: Math.max(Number(cur) || 0, incoming) });
    };
  }
  if (payload.business) {
    const biz = Object.assign({}, emptyBusiness(), payload.business);
    biz.syncStatus = "pending";
    biz.updatedAt = new Date().toISOString();
    meta.put({ key: businessMetaKey(), value: biz });
  }
  return txDone(tx, imported);
}
