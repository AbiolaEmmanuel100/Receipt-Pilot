/* eslint-disable @typescript-eslint/no-explicit-any */
// Port of js/pdf.js. html2canvas and jsPDF are loaded only when the user
// taps Download/Share, instead of on every page view.
export async function loadHtml2canvas(): Promise<any> {
  const m: any = await import("html2canvas");
  return m.default || m;
}

export async function download(el: HTMLElement, filename?: string) {
  const [html2canvas, jspdfMod] = await Promise.all([loadHtml2canvas(), import("jspdf")]);
  if (!html2canvas || !jspdfMod) throw new Error("pdf-lib");
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
  const img = canvas.toDataURL("image/png");
  const JsPDF = (jspdfMod as any).jsPDF || (jspdfMod as any).default;
  const pdf = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = 14;
  const marginY = 12;
  const maxW = pageW - marginX * 2;
  const maxH = pageH - marginY * 2;
  const mmW = (canvas.width * 0.264583) / 2;
  const mmH = (canvas.height * 0.264583) / 2;
  let scale = maxW / mmW;
  if (mmH * scale > maxH) scale = maxH / mmH;
  const w = mmW * scale;
  const h = mmH * scale;
  const x = (pageW - w) / 2;
  pdf.addImage(img, "PNG", x, marginY, w, h);
  pdf.save((filename || "receipt").replace(/[^\w.-]+/g, "_") + ".pdf");
}

/** Print only the given receipt element (replaces print.css page hiding). */
export function printElement(el: HTMLElement | null) {
  if (!el) { window.print(); return; }
  el.classList.add("print-target");
  document.body.classList.add("printing");
  const done = () => {
    el.classList.remove("print-target");
    document.body.classList.remove("printing");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
  setTimeout(done, 1000);
}
