import * as S from "./storage";
import { pushOne } from "./sync";
import { render } from "./receipt";
import { loadHtml2canvas, download as pdfDownload } from "./pdf";
import type { Receipt } from "./types";

// Port of js/share.js (logic). The sheet UI is components/app/ShareSheet.tsx.
export function makeToken() {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 10; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = "";
  for (let j = 0; j < bytes.length; j++) out += alphabet[bytes[j] % alphabet.length];
  return out;
}

export async function ensureToken(record: Receipt): Promise<Receipt> {
  if (!record) return record;
  if (record.shareToken && String(record.shareToken).length >= 8) return record;
  record.shareToken = makeToken();
  record.updatedAt = new Date().toISOString();
  record.syncStatus = "pending";
  await S.saveReceipt(record);
  try { await pushOne(record); } catch { /* offline ok */ }
  return record;
}

export function shareUrl(record: Receipt) {
  const origin = location.origin && location.origin !== "null" ? location.origin : "";
  const path = location.pathname.replace(/[^/]+$/, "") + "r.html";
  return origin + path + "?t=" + encodeURIComponent(String(record.shareToken));
}

export function caption(record: Receipt) {
  const biz = (record.business && record.business.name) || "Receipt Pilot";
  return "Receipt " + (record.number || "") + " from " + biz;
}

export function fileName(record: Receipt) {
  return String(record.number || "receipt").replace(/[^\w.-]+/g, "_") + ".png";
}

function waitImages(root: HTMLElement) {
  const imgs = root.querySelectorAll("img");
  return Promise.all(Array.prototype.map.call(imgs, (img: HTMLImageElement) => {
    if (img.complete && (!img.hasAttribute("data-qr") || img.src)) return Promise.resolve();
    return new Promise<void>((res) => { img.onload = img.onerror = () => res(); setTimeout(res, 3000); });
  }));
}

/** Renders the record off-screen at 420px and captures it as a PNG. */
export async function captureReceipt(record: Receipt): Promise<{ blob: Blob; url: string }> {
  const html2canvas = await loadHtml2canvas();
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:absolute;left:-10000px;top:0;width:420px;background:#fff;padding:0;margin:0;";
  const paper = document.createElement("div");
  host.appendChild(paper);
  document.body.appendChild(host);
  try {
    await render(record, paper);
    await waitImages(host);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const w = Math.max(paper.scrollWidth, paper.offsetWidth, 420);
    const h = Math.max(paper.scrollHeight, paper.offsetHeight);
    const canvas: HTMLCanvasElement = await html2canvas(paper, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false, width: w, height: h, windowWidth: w, windowHeight: h });
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("blob")); return; }
        resolve({ blob, url: URL.createObjectURL(blob) });
      }, "image/png");
    });
  } finally {
    if (host.parentNode) host.parentNode.removeChild(host);
  }
}

/** PDF of a record, rendered off-screen with the same markup. */
export async function downloadPdfFor(record: Receipt) {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:absolute;left:-10000px;top:0;width:720px;background:#fff;";
  const paper = document.createElement("div");
  host.appendChild(paper);
  document.body.appendChild(host);
  try {
    await render(record, paper);
    await waitImages(host);
    await pdfDownload(paper, record.number || "receipt");
  } finally {
    if (host.parentNode) host.parentNode.removeChild(host);
  }
}

export function canShareFile() {
  try {
    const f = new File([new Blob(["x"], { type: "image/png" })], "t.png", { type: "image/png" });
    const n = navigator as Navigator & { share?: unknown; canShare?: (d: ShareData) => boolean };
    return !!(typeof n.share === "function" && typeof n.canShare === "function" && n.canShare({ files: [f] }));
  } catch { return false; }
}

export function triggerDownload(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadImage(record: Receipt) {
  if (!record) return;
  const shot = await captureReceipt(record);
  triggerDownload(shot.url, fileName(record));
  setTimeout(() => URL.revokeObjectURL(shot.url), 4000);
}
