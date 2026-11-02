"use client";
import { useEffect, useRef, useState } from "react";
import { ready as cloudReady } from "@/lib/cloud";
import * as S from "@/lib/storage";
import { money } from "@/lib/calc";
import { downloadImage } from "@/lib/share";
import { download as pdfDownload, printElement } from "@/lib/pdf";
import type { Receipt } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { IconCheck, IconDownload, IconImage, IconPrint } from "@/components/ui/Icons";
import { ReceiptPaper } from "@/components/receipt/ReceiptPaper";

/** Port of r.html: public receipt verification via rpc get_shared_receipt. */
export function SharedReceipt() {
  const [state, setState] = useState<"loading" | "missing" | "ok">("loading");
  const [rec, setRec] = useState<Receipt | null>(null);
  const [err, setErr] = useState("");
  const paper = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const token = (new URLSearchParams(location.search).get("t") || "").trim();
      if (token.length < 8) { setState("missing"); return; }
      let found: Receipt | null = null;
      try {
        const c = await cloudReady();
        if (c) {
          const res = await c.rpc("get_shared_receipt", { share: token });
          if (res.data && typeof res.data === "object") found = res.data as Receipt;
        }
      } catch { /* try local */ }
      if (!found) {
        try {
          const rows = await S.getVisibleReceipts();
          found = rows.find((r) => r.shareToken === token) || null;
        } catch { /* ignore */ }
      }
      if (!found) { setState("missing"); return; }
      setRec(found);
      setState("ok");
    })();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold tracking-tight">Receipt Pilot Receipt Verification</h1>
      {state === "loading" ? <><p className="text-muted">Loading receipt…</p><div className="skeleton h-96 rounded-2xl" aria-hidden="true" /></> : null}
      {state === "missing" ? <p className="rounded-2xl border border-line bg-white p-6 text-center text-muted">This receipt link is invalid or no longer available.</p> : null}
      {state === "ok" && rec ? (
        <>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-ok/30 bg-ok-bg px-4 py-3 text-[15px] font-semibold text-[#065f46]" role="status">
            <span className="inline-flex items-center gap-1"><IconCheck className="size-5" />Receipt Verified ✓</span>
            <span>· {rec.number || ""}</span><span>· {(rec.business && rec.business.name) || ""}</span><span>· {rec.date || ""}</span>
            <span className="tabular">· {money(rec.grand, rec.currency || "NGN")}</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Button size="sm" onClick={async () => { setErr(""); try { if (paper.current) await pdfDownload(paper.current, rec.number || "receipt"); } catch { setErr("Unable to download PDF right now. Use Print instead."); } }}><IconDownload className="size-4" />PDF</Button>
            <Button size="sm" variant="secondary" onClick={async () => { setErr(""); try { await downloadImage(rec); } catch { setErr("Unable to download the image right now."); } }}><IconImage className="size-4" />Image</Button>
            <Button size="sm" variant="secondary" onClick={() => printElement(paper.current)}><IconPrint className="size-4" />Print</Button>
          </div>
          {err ? <p role="alert" className="text-sm font-semibold text-danger">{err}</p> : null}
          <div className="overflow-hidden rounded-2xl border border-line bg-white p-2 shadow-soft"><ReceiptPaper ref={paper} record={rec} id="shareReceiptEl" /></div>
        </>
      ) : null}
    </div>
  );
}
