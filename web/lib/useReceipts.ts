"use client";
import { useEffect, useState } from "react";
import * as S from "./storage";
import { AUTH_EVENT, RECEIPTS_EVENT, ready } from "./session";
import { sync } from "./sync";
import type { Receipt } from "./types";

/**
 * Same loading sequence as sales.js / customers.html: read this device's
 * visible receipts, re-read after the account is ready, re-read on auth
 * change, then sync and re-read. No new data source.
 */
export function useReceipts(): { rows: Receipt[]; loaded: boolean } {
  const [rows, setRows] = useState<Receipt[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let on = true;
    const load = () => Promise.resolve(S.getVisibleReceipts()).then((r) => { if (on) { setRows(r || []); setLoaded(true); } }).catch(() => { if (on) setLoaded(true); });
    load();
    const onAuth = () => { setRows([]); load(); };
    ready.then(async () => {
      if (!on) return;
      await load();
      document.addEventListener(AUTH_EVENT, onAuth);
      document.addEventListener(RECEIPTS_EVENT, load);
      Promise.resolve(sync()).then(load).catch(() => { /* keep local */ });
    });
    return () => { on = false; document.removeEventListener(AUTH_EVENT, onAuth); document.removeEventListener(RECEIPTS_EVENT, load); };
  }, []);
  return { rows, loaded };
}
