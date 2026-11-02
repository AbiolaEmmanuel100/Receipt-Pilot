import { sanitize as s } from "./val";
import { money } from "./calc";
import type { Receipt } from "./types";

// Port of js/receipt.js. The markup and class names are identical, so the
// receipt looks the same on screen, in print, in the PDF and in the PNG.
export function verifyUrlFor(record: Pick<Receipt, "shareToken">): string {
  if (!record.shareToken) return "";
  const origin = location.origin && location.origin !== "null" ? location.origin : "";
  const path = location.pathname.replace(/[^/]+$/, "") + "r.html";
  return origin + path + "?t=" + encodeURIComponent(record.shareToken);
}

export function receiptHtml(record: Partial<Receipt>): { className: string; html: string; hasLogo: boolean } {
  const cur = record.currency || "NGN";
  const biz = record.business || {};
  const cust = record.customer || {};
  const items = record.items || [];
  const rawLogo = String(biz.logo || "");
  let safeLogo = "";
  if (/^data:image\//i.test(rawLogo) || /^https:\/\//i.test(rawLogo)) safeLogo = rawLogo;
  const logo = safeLogo ? '<div class="logo-wrap"><img alt="' + s(biz.name || "Business logo") + '" src="' + s(safeLogo) + '"></div>' : "";

  const lines: string[] = [];
  if (biz.address) lines.push(s(biz.address).replace(/\n/g, "<br>"));
  const row = [biz.phone, biz.email, biz.website].filter(Boolean).map(s);
  if (row.length) lines.push(row.join(" · "));

  const custBits: string[] = [];
  if (cust.name) custBits.push(s(cust.name));
  if (cust.phone) custBits.push(s(cust.phone));
  if (cust.email) custBits.push(s(cust.email));

  const rows = items.map((it) => {
    const tot = it.total != null ? it.total : (Number(it.qty) || 0) * (Number(it.price) || 0);
    return "<tr><td class='col-item'>" + s(it.name || "—") + "</td>" +
      "<td class='col-num'>" + s(it.qty) + "</td>" +
      "<td class='col-num'>" + money(it.price, cur) + "</td>" +
      "<td class='col-num'>" + money(tot, cur) + "</td></tr>";
  }).join("");

  let status = record.status || "UNPAID";
  if (status === "PAID") status = "PAID IN FULL";
  const statusClass = "st-" + status.replace(/\s+/g, "-").toLowerCase();
  const footer = (biz.footer && String(biz.footer).trim()) || "Thank you for your business.";
  const verifyUrl = verifyUrlFor(record as Receipt);

  const html =
    '<div class="r-brand">' + (logo ? logo : "") +
      '<div class="r-brand-text">' +
        '<div class="r-biz">' + s(biz.name || "Your Business") + "</div>" +
        '<div class="r-contact">' + lines.join("<br>") + "</div>" +
      "</div>" +
    "</div>" +
    '<div class="r-banner"><span class="r-title">RECEIPT</span></div>' +
    '<div class="r-info">' +
      '<div><span class="k">Receipt No.</span><span class="v">' + s(record.number || "—") + "</span></div>" +
      '<div><span class="k">Date</span><span class="v">' + s(record.date || "") + (record.time ? " · " + s(record.time) : "") + "</span></div>" +
      (custBits.length ? '<div class="span-2"><span class="k">Customer</span><span class="v">' + custBits.join(" · ") + "</span></div>" : "") +
    "</div>" +
    '<table class="r-table"><thead><tr><th class="col-item">Item</th><th class="col-num">Qty</th><th class="col-num">Price</th><th class="col-num">Total</th></tr></thead><tbody>' +
    (rows || "<tr><td colspan='4'>No items</td></tr>") + "</tbody></table>" +
    '<div class="r-summary">' +
      '<div class="r-paymeta">' +
        "<div><span class='k'>Payment method</span><span>" + s(record.payment || "") + "</span></div>" +
        '<div><span class="k">Payment Status</span><span class="r-status ' + statusClass + '">' + s(status) + "</span></div>" +
        (record.notes ? "<div class='r-notes'><span class='k'>Notes</span><p>" + s(record.notes).replace(/\n/g, "<br>") + "</p></div>" : "") +
      "</div>" +
      '<div class="r-totals">' +
        "<div><span>Subtotal</span><span>" + money(record.subtotal, cur) + "</span></div>" +
        "<div><span>Discount</span><span>" + money(record.discount, cur) + "</span></div>" +
        "<div><span>Tax (" + s(record.taxPct || 0) + "%)</span><span>" + money(record.tax, cur) + "</span></div>" +
        ((Number(record.shipping) || 0) > 0 ? "<div><span>Delivery</span><span>" + money(record.shipping, cur) + "</span></div>" : "") +
        '<div class="grand"><span>Grand Total</span><span>' + money(record.grand, cur) + "</span></div>" +
        "<div><span>Amount Paid</span><span>" + money(record.paid, cur) + "</span></div>" +
        "<div><span>Balance Due</span><span>" + money(record.balance, cur) + "</span></div>" +
      "</div>" +
    "</div>" +
    '<div class="r-foot">' + s(footer) + "</div>" +
    (verifyUrl ? '<div class="r-verify"><img class="r-qr" alt="Verify this receipt" data-qr="' + s(verifyUrl) + '"><p>Scan to verify</p></div>' : "");

  return { className: "receipt style-" + (record.template || "classic") + (safeLogo ? "" : " hidden-logo"), html, hasLogo: !!safeLogo };
}

/** Same as ReceiptlyReceipt.render(record, target). */
export function render(record: Partial<Receipt>, target: HTMLElement) {
  const out = receiptHtml(record);
  target.className = out.className;
  target.innerHTML = out.html;
  return fillQr(target);
}

// QR code: the library is code-split and only loaded when a receipt with a
// verification link is shown (previously a CDN script on every page load).
type QRLib = { toDataURL: (t: string, o: object) => Promise<string> };
let qrLib: Promise<QRLib | null> | null = null;
function loadQr(): Promise<QRLib | null> {
  if (!qrLib) {
    qrLib = import("qrcode").then((m) => (m.default || m) as unknown as QRLib).catch(() => { qrLib = null; return null; });
  }
  return qrLib;
}

export async function fillQr(root: HTMLElement): Promise<void> {
  const img = root.querySelector<HTMLImageElement>("[data-qr]");
  if (!img) return;
  const data = img.getAttribute("data-qr");
  if (!data) return;
  const lib = await loadQr();
  if (lib && lib.toDataURL) {
    try {
      const url = await lib.toDataURL(data, { width: 96, margin: 1, errorCorrectionLevel: "M" });
      if (url && img.isConnected) img.src = url;
      return;
    } catch { /* fall through */ }
  }
  img.src = "https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=" + encodeURIComponent(data);
}
