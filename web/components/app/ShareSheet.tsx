"use client";
import { useEffect, useRef, useState } from "react";
import { shareSheet, toast } from "@/lib/bus";
import { useStore } from "@/lib/useStore";
import * as Sh from "@/lib/share";
import { analyze, whatsappDigits } from "@/lib/phone";
import { log as activityLog } from "@/lib/activity";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage, Input } from "@/components/ui/Field";
import { IconCopy, IconDownload, IconFile, IconMail, IconShare, IconWhatsApp } from "@/components/ui/Icons";
import type { Receipt } from "@/lib/types";

/** Port of share.js's "Send Receipt" sheet. Same options and messages. */
export function openShare(record: Receipt | null) {
  if (!record) { toast("Save the receipt first, then send it.", "error"); return; }
  shareSheet.set({ open: true, record });
}

export function ShareSheet() {
  const st = useStore(shareSheet);
  const [rec, setRec] = useState<Receipt | null>(null);
  const [img, setImg] = useState<{ blob: Blob; url: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [view, setView] = useState<"menu" | "wa">("menu");
  const [phone, setPhone] = useState("");
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [waErr, setWaErr] = useState("");
  const [busy, setBusy] = useState("");
  const imgRef = useRef<{ blob: Blob; url: string } | null>(null);
  const job = useRef<Promise<{ blob: Blob; url: string }> | null>(null);
  const canFile = typeof window !== "undefined" && Sh.canShareFile();

  useEffect(() => {
    if (!st.open || !st.record) return;
    let live = true;
    setOk(""); setErr(""); setWaErr(""); setView("menu");
    if (imgRef.current) URL.revokeObjectURL(imgRef.current.url);
    imgRef.current = null; job.current = null; setImg(null);
    (async () => {
      const r = await Sh.ensureToken(st.record as Receipt);
      if (!live) return;
      setRec(r);
      const stored = (r.customer && r.customer.phone) || "";
      const info = analyze(stored, (r.customer && r.customer.phoneCountry) || "");
      setPhone(info.valid ? info.e164 : stored);
      ensureImage(r).catch(() => {});
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.open, st.record]);

  function ensureImage(r = rec): Promise<{ blob: Blob; url: string }> {
    if (imgRef.current) return Promise.resolve(imgRef.current);
    if (job.current) return job.current;
    if (!r) return Promise.reject(new Error("no record"));
    setPreparing(true);
    job.current = Sh.captureReceipt(r).then((shot) => {
      imgRef.current = shot; setImg(shot); return shot;
    }).finally(() => { setPreparing(false); job.current = null; });
    return job.current;
  }
  function file(shot: { blob: Blob }) { return new File([shot.blob], Sh.fileName(rec as Receipt), { type: "image/png" }); }
  function status(o: string, e: string) { setOk(o); setErr(e); }
  function close() { shareSheet.set({ open: false, record: null }); }

  async function choose(kind: string) {
    if (!rec) return;
    status("", "");
    setBusy(kind);
    try {
      if (kind === "wa") {
        setView("wa"); setWaErr("");
        try { await ensureImage(); } catch { setWaErr("Could not create the receipt image. Try Download PDF instead."); }
        return;
      }
      if (kind === "image") {
        try { const shot = await ensureImage(); Sh.triggerDownload(shot.url, Sh.fileName(rec)); status("Receipt downloaded", ""); }
        catch { status("", "Could not create the receipt image."); }
        return;
      }
      if (kind === "email") {
        try {
          const shot = await ensureImage();
          if (Sh.canShareFile()) {
            await navigator.share({ files: [file(shot)], title: Sh.caption(rec), text: Sh.caption(rec) });
            status("Choose Email in the share menu, or attach the image if you already downloaded it.", "");
            return;
          }
          Sh.triggerDownload(shot.url, Sh.fileName(rec));
          const to = (rec.customer && rec.customer.email) || "";
          const sub = encodeURIComponent(Sh.caption(rec));
          const body = encodeURIComponent("Please find the receipt image in your downloads and attach it to this email.\n\n" + Sh.caption(rec));
          location.href = "mailto:" + encodeURIComponent(to) + "?subject=" + sub + "&body=" + body;
          status("Image downloaded. Attach that PNG to the email that just opened. Browsers cannot attach files to email automatically.", "");
        } catch (e) {
          if (e && (e as Error).name === "AbortError") return;
          status("", "Could not prepare the receipt image for email.");
        }
        return;
      }
      if (kind === "pdf") {
        try { await Sh.downloadPdfFor(rec); status("Receipt downloaded", ""); }
        catch { status("", "PDF library is still loading. Try again."); }
        return;
      }
      if (kind === "link") {
        const url = Sh.shareUrl(rec);
        let copied = false;
        try { await navigator.clipboard.writeText(url); copied = true; } catch { copied = false; }
        if (!copied) {
          const ta = document.createElement("textarea");
          ta.value = url; ta.setAttribute("readonly", "readonly"); ta.style.cssText = "position:fixed;left:-9999px;top:0";
          document.body.appendChild(ta); ta.select();
          try { copied = document.execCommand("copy"); } catch { copied = false; }
          document.body.removeChild(ta);
        }
        if (copied) status("Link copied.", ""); else status("", "Could not copy the link. Select and copy it manually: " + url);
        return;
      }
      if (kind === "more") {
        try {
          const shot = await ensureImage();
          if (Sh.canShareFile()) {
            await navigator.share({ files: [file(shot)], title: Sh.caption(rec), text: Sh.caption(rec) });
            status("Shared.", "");
          } else if (navigator.share) {
            Sh.triggerDownload(shot.url, Sh.fileName(rec));
            await navigator.share({ title: Sh.caption(rec), text: Sh.caption(rec) });
            status("Image downloaded. Attach it from the share menu if your app allows files.", "");
          } else {
            Sh.triggerDownload(shot.url, Sh.fileName(rec));
            status("Image downloaded. This browser has no extra share menu.", "");
          }
        } catch (e) {
          if (e && (e as Error).name === "AbortError") return;
          status("", "Sharing was cancelled or is not available.");
        }
      }
    } finally { setBusy(""); }
  }

  async function openWhatsApp() {
    if (!rec) return;
    setWaErr("");
    if (preparing) { setWaErr("Still preparing the receipt image…"); return; }
    const digits = whatsappDigits(phone, "");
    if (!digits) { setWaErr("Enter a valid international number with a country code, for example +234… WhatsApp was not opened."); return; }
    let shot;
    try { shot = await ensureImage(); } catch { setWaErr("Could not create the receipt image."); return; }
    const note = Sh.caption(rec);
    if (Sh.canShareFile()) {
      try {
        await navigator.share({ files: [file(shot)], title: note, text: note });
        status("Pick WhatsApp in the share list to send the receipt image. If WhatsApp is not listed, download the image and attach it in the chat.", "");
        activityLog("receipt_shared", { number: rec.number });
        return;
      } catch (e) {
        if (e && (e as Error).name === "AbortError") return;
      }
    }
    Sh.triggerDownload(shot.url, Sh.fileName(rec));
    window.open("https://wa.me/" + digits + "?text=" + encodeURIComponent("Hello, here is your receipt (" + (rec.number || "") + "). Please see the receipt image I am sending."), "_blank", "noopener");
    status("Receipt image downloaded. WhatsApp opened — attach that PNG in the chat. Browsers cannot drop the file into WhatsApp automatically.", "");
  }

  const sub = !rec ? "Generating receipt…" : view === "wa" ? "Send via WhatsApp" : "How would you like to send " + (rec.number || "this receipt") + "?";
  const opt = "press flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-white px-4 text-left font-semibold hover:border-brand disabled:opacity-60";

  return (
    <Modal open={st.open} onClose={close} title="Send Receipt" description={sub} size="md">
      <div className="space-y-4">
        <div className="flex max-h-56 justify-center overflow-hidden rounded-2xl border border-line bg-bg p-3" aria-live="polite">
          {img ? <img src={img.url} alt="Receipt preview" className="h-auto max-h-52 w-auto rounded-md shadow-soft" />
            : <div className="skeleton h-48 w-36 rounded-md" aria-label="Preparing receipt image" />}
        </div>
        {view === "menu" ? (
          <div className="grid gap-2">
            <button type="button" className={opt + " border-[#25D366]/40 bg-[#25D366]/5"} onClick={() => choose("wa")}>
              <span className="flex size-9 items-center justify-center rounded-full bg-[#25D366] text-white"><IconWhatsApp className="size-5" /></span>Send via WhatsApp
            </button>
            {canFile ? (
              <button type="button" className={opt} onClick={() => choose("more")} disabled={busy === "more"}>
                <span className="flex size-9 items-center justify-center rounded-full bg-brand-light text-brand"><IconShare className="size-5" /></span>Share
              </button>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={opt} onClick={() => choose("email")}><IconMail className="size-5 text-brand" />Email</button>
              <button type="button" className={opt} onClick={() => choose("link")}><IconCopy className="size-5 text-brand" />Copy link</button>
              <button type="button" className={opt} onClick={() => choose("image")}><IconDownload className="size-5 text-brand" />Image</button>
              <button type="button" className={opt} onClick={() => choose("pdf")} disabled={busy === "pdf"}><IconFile className="size-5 text-brand" />PDF</button>
            </div>
            {!canFile ? (
              <button type="button" className={opt} onClick={() => choose("more")}><IconShare className="size-5 text-brand" />Share</button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Customer WhatsApp number" id="sharePhone">
              <Input id="sharePhone" type="tel" inputMode="tel" placeholder="International number, e.g. +234…" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <p className="text-sm text-muted">The customer receives this receipt image, using the same design as Receipt Pilot.</p>
            <FormMessage error={waErr} />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={openWhatsApp} block className="bg-[#128C4B] hover:bg-[#0e7a40]"><IconWhatsApp className="size-5" />{canFile ? "Share/Send image" : "Download image & open WhatsApp"}</Button>
              <Button variant="ghost" onClick={() => { setView("menu"); setWaErr(""); }}>Back</Button>
            </div>
          </div>
        )}
        <FormMessage ok={ok} error={err} />
      </div>
    </Modal>
  );
}
