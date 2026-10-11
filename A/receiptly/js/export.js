(function (global) {
  "use strict";

  function csvEscape(v) {
    var s = String(v == null ? "" : v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(receipts) {
    var headers = [
      "Receipt Number", "Date", "Time", "Customer", "Customer Phone",
      "Subtotal", "Discount", "Tax", "Grand Total", "Amount Paid", "Balance Due",
      "Payment Method", "Payment Status", "Currency", "Notes", "Created At", "Updated At"
    ];
    var lines = [headers.join(",")];
    (receipts || []).forEach(function (r) {
      var row = [
        r.number, r.date, r.time || "",
        (r.customer && r.customer.name) || "",
        (r.customer && r.customer.phone) || "",
        r.subtotal, r.discount, r.tax, r.grand, r.paid, r.balance,
        r.payment, r.status, r.currency, r.notes || "",
        r.createdAt || "", r.updatedAt || ""
      ];
      lines.push(row.map(csvEscape).join(","));
    });
    return lines.join("\n");
  }

  function downloadBlob(content, mime, filename) {
    var blob = new Blob([content], { type: mime });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  function downloadCsv(receipts) {
    downloadBlob(toCsv(receipts), "text/csv;charset=utf-8", "receipt-records.csv");
  }

  function downloadBackup(payload) {
    var date = new Date().toISOString().slice(0, 10);
    downloadBlob(JSON.stringify(payload, null, 2), "application/json", "receipt-records-backup-" + date + ".json");
  }

  global.ReceiptlyExport = {
    toCsv: toCsv,
    downloadCsv: downloadCsv,
    downloadBackup: downloadBackup
  };
})(window);
