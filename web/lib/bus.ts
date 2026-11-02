// Tiny UI event bus: replaces ReceiptlyUI.toast / confirm / dialog toggles
// that the legacy scripts drove through the DOM.
type Listener<T> = (v: T) => void;

export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener<T>>();
  return {
    get: () => value,
    set: (v: T) => { value = v; listeners.forEach((l) => l(value)); },
    subscribe: (l: Listener<T>) => { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

export interface ToastMsg { id: number; text: string; type: "" | "error" }
export const toasts = createStore<ToastMsg[]>([]);
let toastId = 0;
export function toast(text: string, type: "" | "error" = "") {
  const id = ++toastId;
  toasts.set([...toasts.get().slice(-2), { id, text, type }]);
  setTimeout(() => toasts.set(toasts.get().filter((t) => t.id !== id)), 3200);
}

export interface ConfirmOpts {
  title?: string; message?: string; confirmLabel?: string; cancelLabel?: string;
  danger?: boolean; requireText?: string; extraLabel?: string; extraDanger?: boolean;
}
export type ConfirmResult = boolean | "extra";
export const confirmState = createStore<{ opts: ConfirmOpts; resolve: (v: ConfirmResult) => void } | null>(null);
export function confirm(opts: ConfirmOpts): Promise<ConfirmResult> {
  return new Promise((resolve) => {
    const prev = confirmState.get();
    if (prev) prev.resolve(false);
    confirmState.set({ opts, resolve });
  });
}

// Sync / offline chip (account.js updateChip)
export const chip = createStore<{ text: string; sticky: boolean } | null>(null);
export function updateChip(text: string, sticky?: boolean) {
  if (!text) { chip.set(null); return; }
  chip.set({ text, sticky: !!sticky });
  if (!sticky) setTimeout(() => { const c = chip.get(); if (c && c.text === text) chip.set(null); }, 4000);
}

export type AuthPanel = "login" | "signup" | "verify" | "forgot" | "reauth" | "account";
export const authDialog = createStore<{ open: boolean; panel: AuthPanel }>({ open: false, panel: "login" });
export function showAuth(panel: AuthPanel) { authDialog.set({ open: true, panel }); }
export function hideAuth() { authDialog.set({ ...authDialog.get(), open: false }); }

export const claimDialog = createStore<{ open: boolean; count: number }>({ open: false, count: 0 });
export const usageGate = createStore<boolean>(false);
export const paywall = createStore<{ open: boolean; mode: "expired" | "error"; message: string }>({ open: false, mode: "expired", message: "" });

/* eslint-disable @typescript-eslint/no-explicit-any */
export const shareSheet = createStore<{ open: boolean; record: any | null }>({ open: false, record: null });

/** True while /signin renders the auth panels inline (the modal stays closed). */
export const inlineAuthHost = createStore<boolean>(false);
