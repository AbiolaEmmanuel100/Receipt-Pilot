"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

// Same keys and guidance as js/pwa.js, as a slim banner.
const DISMISS = "receiptly_install_dismiss";
const IOS_DISMISS = "receiptly_ios_install_dismiss";
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function standalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
function isIos() { return /iPhone|iPad|iPod/i.test(navigator.userAgent || ""); }
function isInApp() { return /FBAN|FBAV|Instagram|Line\/|WhatsApp|Twitter|Snapchat|TikTok|wv\)/i.test(navigator.userAgent || ""); }

export function InstallBanner() {
  const [prompt, setPrompt] = useState<BIP | null>(null);
  const [mode, setMode] = useState<"" | "prompt" | "ios">("");
  useEffect(() => {
    if (standalone()) return;
    const on = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BIP);
      try { if (localStorage.getItem(DISMISS) !== "1") setMode("prompt"); } catch { /* ignore */ }
    };
    window.addEventListener("beforeinstallprompt", on);
    const installed = () => setMode("");
    window.addEventListener("appinstalled", installed);
    try { if (isIos() && !isInApp() && localStorage.getItem(IOS_DISMISS) !== "1") setMode("ios"); } catch { /* ignore */ }
    return () => { window.removeEventListener("beforeinstallprompt", on); window.removeEventListener("appinstalled", installed); };
  }, []);
  if (!mode) return null;
  function dismiss() {
    try { localStorage.setItem(mode === "ios" ? IOS_DISMISS : DISMISS, "1"); } catch { /* ignore */ }
    setMode("");
  }
  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    try { await prompt.userChoice; } catch { /* ignore */ }
    setPrompt(null); setMode("");
  }
  return (
    <div className="border-b border-line bg-white" role="region" aria-label="Install Receipt Pilot">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <p className="text-sm text-muted">{mode === "ios" ? "On iPhone or iPad, tap Share, then choose Add to Home Screen." : "Install Receipt Pilot on this device."}</p>
        <div className="flex gap-1">
          {mode === "prompt" ? <Button size="sm" onClick={install}>Install Receipt Pilot</Button> : null}
          <Button size="sm" variant="ghost" onClick={dismiss}>Not now</Button>
        </div>
      </div>
    </div>
  );
}
