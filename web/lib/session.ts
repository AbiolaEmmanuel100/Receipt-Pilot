import type { SessionUser } from "./types";

// Shared signed-in user state (replaces the sessionUser closure in account.js).
let sessionUser: SessionUser | null = null;

export function user(): SessionUser | null { return sessionUser; }
export function userId(): string | null { return (sessionUser && sessionUser.id) || null; }
export function setUser(u: SessionUser | null) { sessionUser = u; }

export const AUTH_EVENT = "receiptly-auth-change";

/** Same event name as the legacy site, so behaviour is identical. */
export function emitAuthChange() {
  try { document.dispatchEvent(new CustomEvent(AUTH_EVENT)); } catch { /* ignore */ }
}

let readyResolve: () => void = () => {};
export const ready: Promise<void> = typeof window === "undefined"
  ? Promise.resolve()
  : new Promise<void>((res) => { readyResolve = res; });
export function resolveReady() { readyResolve(); }
