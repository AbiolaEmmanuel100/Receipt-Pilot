"use client";
import { useEffect, useState } from "react";
import { createStore } from "@/lib/bus";
import { useStore } from "@/lib/useStore";
import { DISMISS, IOS_DISMISS, promptInstall, useInstall, type InstallMode } from "@/lib/install";
import { track } from "@/lib/analytics";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cx } from "@/components/ui/cx";
import { IconAddSquare, IconCheck, IconInstall, IconMore, IconShare } from "@/components/ui/Icons";

export const installGuide = createStore(false);

/** Tap handler shared by every "Install app" entry: the browser's own prompt when there is one, otherwise the guide. */
export async function startInstall(mode: InstallMode, where: string) {
  try { track("pwa_install_clicked", { page: where }); } catch { /* ignore */ }
  if (mode === "prompt") { const r = await promptInstall(); if (r) return; }
  installGuide.set(true);
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-deep">{n}</span>
      <div className="min-w-0 pt-0.5 text-[15px] leading-relaxed text-ink">{children}</div>
    </li>
  );
}
const Key = ({ children }: { children: React.ReactNode }) => <span className="inline-flex items-center gap-1 rounded-md border border-line bg-slate-50 px-1.5 py-0.5 align-middle text-sm font-semibold">{children}</span>;

export function InstallGuide() {
  const open = useStore(installGuide);
  const mode = useInstall();
  return (
    <Modal open={open} onClose={() => installGuide.set(false)} title="Add Receipt Pilot to your home screen" description="It opens full screen like an app, with no app store needed." size="sm">
      <div id="installGuide" data-mode={mode} className="space-y-4">
        {mode === "inapp" ? (
          <ol className="space-y-3">
            <Step n={1}>This page is open inside another app. Tap <Key><IconMore className="size-4" />menu</Key> and choose <b>Open in browser</b> (Safari or Chrome).</Step>
            <Step n={2}>In the browser, tap <b>Install app</b> again.</Step>
          </ol>
        ) : mode === "ios" ? (
          <ol className="space-y-3">
            <Step n={1}>Tap the <Key><IconShare className="size-4" />Share</Key> button in Safari&apos;s toolbar.</Step>
            <Step n={2}>Scroll down and tap <Key><IconAddSquare className="size-4" />Add to Home Screen</Key>.</Step>
            <Step n={3}>Tap <b>Add</b>. Receipt Pilot appears on your home screen.</Step>
          </ol>
        ) : (
          <ol className="space-y-3">
            <Step n={1}>Open your browser menu <Key><IconMore className="size-4" /></Key> (top right in Chrome and Edge).</Step>
            <Step n={2}>Choose <b>Install app</b>, <b>Add to Home screen</b> or <b>Install Receipt Pilot</b>.</Step>
            <Step n={3}>On a computer you can also use the install icon <Key><IconInstall className="size-4" /></Key> at the right of the address bar.</Step>
          </ol>
        )}
        <p className="flex items-center gap-2 text-sm text-muted"><IconCheck className="size-4 text-brand" />Your receipts stay the same; you sign in once.</p>
        <Button block onClick={() => installGuide.set(false)}>Done</Button>
      </div>
    </Modal>
  );
}

/** Menu entry (sidebar / More sheet). Hidden when already installed. */
export function InstallEntry({ where, className, onDone }: { where: "sidebar" | "more"; className?: string; onDone?: () => void }) {
  const mode = useInstall();
  if (mode === "hidden") return null;
  return (
    <button type="button" data-install-entry={where} className={className}
      onClick={() => { onDone?.(); void startInstall(mode, where); }}>
      <IconInstall className="size-5 text-brand" />Install app
    </button>
  );
}

/** Small, dismissible card on the dashboard. Not a popup; "Not now" only hides this card. */
export function InstallCard() {
  const mode = useInstall();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(localStorage.getItem(DISMISS) === "1" || (mode === "ios" && localStorage.getItem(IOS_DISMISS) === "1")); } catch { setHidden(false); }
  }, [mode]);
  if (mode === "hidden" || hidden) return null;
  return (
    <Card className="flex items-center gap-3 p-3.5" data-install-card={mode}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand"><IconInstall className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-tight">Install the app</p>
        <p className="text-sm text-muted">Open Receipt Pilot from your home screen.</p>
      </div>
      <div className="flex shrink-0 items-center">
        <Button size="sm" data-install-entry="dashboard" onClick={() => void startInstall(mode, "dashboard")}>Install</Button>
        <button type="button" aria-label="Hide install suggestion" className={cx("min-h-11 rounded-xl px-2.5 text-sm font-semibold text-muted hover:bg-slate-100")}
          onClick={() => { try { localStorage.setItem(mode === "ios" ? IOS_DISMISS : DISMISS, "1"); } catch { /* ignore */ } setHidden(true); }}>Not now</button>
      </div>
    </Card>
  );
}
