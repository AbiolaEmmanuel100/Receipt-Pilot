"use client";
// "Install app" (Add to Home Screen). The browser's beforeinstallprompt event is
// captured by a tiny inline script in app/layout.tsx (it can fire before React
// loads); this module reads it. Nothing here is a popup: the UI only appears
// where the user taps "Install app".
import { useEffect, useState } from "react";

export type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export type InstallMode = "hidden" | "prompt" | "ios" | "inapp" | "manual";
type W = Window & { __rpBip?: BIP | null; __rpInstalled?: number };

export const INSTALL_EVENT = "rp-bip";
// Same keys as js/pwa.js: they only hide the dashboard card, never the menu entries.
export const DISMISS = "receiptly_install_dismiss";
export const IOS_DISMISS = "receiptly_ios_install_dismiss";

export function isStandalone() {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch { return false; }
}
export function isIos() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}
export function isInApp() { return /FBAN|FBAV|Instagram|Line\/|WhatsApp|Twitter|Snapchat|TikTok|; wv\)/i.test(navigator.userAgent || ""); }

export function installMode(): InstallMode {
  const w = window as W;
  if (isStandalone() || w.__rpInstalled) return "hidden";
  if (w.__rpBip) return "prompt";
  if (isInApp()) return "inapp";
  if (isIos()) return "ios";
  return "manual";
}

/** Shows the browser's own install dialog. Returns the user's choice, or "" if no prompt is available. */
export async function promptInstall(): Promise<string> {
  const w = window as W;
  const e = w.__rpBip;
  if (!e) return "";
  w.__rpBip = null;
  await e.prompt();
  let outcome = "";
  try { outcome = (await e.userChoice).outcome; } catch { /* ignore */ }
  window.dispatchEvent(new Event(INSTALL_EVENT));
  return outcome;
}

export function useInstall(): InstallMode {
  const [mode, setMode] = useState<InstallMode>("hidden");
  useEffect(() => {
    const update = () => setMode(installMode());
    update();
    window.addEventListener(INSTALL_EVENT, update);
    let mq: MediaQueryList | null = null;
    try { mq = window.matchMedia("(display-mode: standalone)"); mq.addEventListener("change", update); } catch { /* ignore */ }
    return () => { window.removeEventListener(INSTALL_EVENT, update); if (mq) mq.removeEventListener("change", update); };
  }, []);
  return mode;
}

