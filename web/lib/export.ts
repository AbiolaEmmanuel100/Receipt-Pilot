import type { Receipt } from "./types";

// Port of js/export.js
function csvEscape(v: unknown) {
  const s = String(v == null ? "" : v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(receipts: Receipt[]) {
  const headers = ["Receipt Number", "Date", "Time", "Customer", "Customer Phone", "Subtotal", "Discount", "Tax", "Grand Total", "Amount Paid", "Balance Due", "Payment Method", "Payment Status", "Currency", "Notes", "Created At", "Updated At"];
  const lines = [headers.join(",")];
  (receipts || []).forEach((r) => {
    const row = [r.number, r.date, r.time || "", (r.customer && r.customer.name) || "", (r.customer && r.customer.phone) || "", r.subtotal, r.discount, r.tax, r.grand, r.paid, r.balance, r.payment, r.status, r.currency, r.notes || "", r.createdAt || "", r.updatedAt || ""];
    lines.push(row.map(csvEscape).join(","));
  });
  return lines.join("\n");
}

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export function downloadCsv(receipts: Receipt[]) {
  downloadBlob(toCsv(receipts), "text/csv;charset=utf-8", "receipt-records.csv");
}

export function downloadBackup(payload: unknown) {
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(JSON.stringify(payload, null, 2), "application/json", "receipt-records-backup-" + date + ".json");
}
