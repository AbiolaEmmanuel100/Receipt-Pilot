"use client";
import { useEffect, useState } from "react";
import { AUTH_EVENT, user } from "./session";
import type { SessionUser } from "./types";

/** Re-renders whenever account.ts emits "receiptly-auth-change". */
export function useSessionUser(): { user: SessionUser | null; version: number } {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const on = () => setVersion((v) => v + 1);
    document.addEventListener(AUTH_EVENT, on);
    on();
    return () => document.removeEventListener(AUTH_EVENT, on);
  }, []);
  const u = user();
  return { user: u ? { ...u } : null, version };
}
