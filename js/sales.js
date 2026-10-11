(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };

  function startOfWeek(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = x.getDay();
    var diff = day === 0 ? 6 : day - 1;
    x.setDate(x.getDate() - diff);
    return x;
  }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function normStatus(st) {
    if (st === "PAID") return "PAID IN FULL";
    return st || "UNPAID";
  }

  function summarize(list) {
    var sales = 0, paid = 0, nPaid = 0, nPart = 0, nUnpaid = 0, refunded = 0, nRefund = 0;
    list.forEach(function (r) {
      if (r.voided) return;
      if (r.refunded) {
        refunded += Number(r.grand) || 0;
        nRefund++;
        return;
      }
      sales += Number(r.grand) || 0;
      paid += Number(r.paid) || 0;
      var st = normStatus(r.status);
      if (st === "PAID IN FULL") nPaid++;
      else if (st === "PARTIALLY PAID") nPart++;
      else nUnpaid++;
    });
    var live = list.filter(function (r) { return !r.voided && !r.refunded; });
    return {
      count: live.length,
      sales: sales,
      paid: paid,
      outstanding: Math.max(0, sales - paid),
      avg: live.length ? sales / live.length : 0,
      nPaid: nPaid,
      nPart: nPart,
      nUnpaid: nUnpaid,
      refunded: refunded,
      nRefund: nRefund
    };
  }

  function money(n, list) {
    var cur = (list[0] && list[0].currency) || "NGN";
    return ReceiptlyCalc.money(n, cur);
  }

  var all = [];
  var view = "daily";

  function periodBounds() {
    var today = new Date();
    var preset = $("#salesPreset").value;
    var from = iso(today), to = iso(today);
    if (preset === "yesterday") {
      var y = addDays(today, -1); from = to = iso(y);
    } else if (preset === "week" || view === "weekly") {
      from = iso(startOfWeek(today)); to = iso(today);
    } else if (preset === "lastWeek") {
      var end = addDays(startOfWeek(today), -1);
      from = iso(startOfWeek(end)); to = iso(end);
    } else if (preset === "month" || view === "monthly") {
      from = iso(new Date(today.getFullYear(), today.getMonth(), 1)); to = iso(today);
    } else if (preset === "lastMonth") {
      from = iso(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      to = iso(new Date(today.getFullYear(), today.getMonth(), 0));
    } else if (preset === "custom") {
      from = $("#salesFrom").value || from;
      to = $("#salesTo").value || to;
    } else if (view === "daily") {
      from = to = $("#salesDay").value || iso(today);
    }
    return { from: from, to: to };
  }

  function dateKey(dateStr) {
    if (!dateStr) return "";
    var m = String(dateStr).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  }

  function inRange(r, from, to) {
    var key = dateKey(r && r.date);
    if (!key) return false;
    return key >= from && key <= to;
  }

  function render() {
    var empty = $("#salesEmpty");
    var report = $("#salesReport");
    var live = (all || []).filter(function (r) { return !r.isDraft; });
    if (empty && report) {
      var none = !live.length;
      empty.hidden = !none;
      report.hidden = none;
      if (none) return;
    }
    var b = periodBounds();
    var list = all.filter(function (r) { return !r.isDraft && inRange(r, b.from, b.to); });
    list.sort(function (a, b) {
      var da = a.date || "";
      var db = b.date || "";
      if (da !== db) return da < db ? 1 : -1;
      return String(b.number || "").localeCompare(String(a.number || ""), undefined, { numeric: true });
    });
    var s = summarize(list);
    $("#salesTotal").textContent = money(s.sales, list.length ? list : all);
    $("#salesPaid").textContent = money(s.paid, list.length ? list : all);
    $("#salesOut").textContent = money(s.outstanding, list.length ? list : all);
    $("#salesCount").textContent = String(s.count);
    $("#salesPaidN").textContent = String(s.nPaid);
    $("#salesPartN").textContent = String(s.nPart);
    $("#salesUnpaidN").textContent = String(s.nUnpaid);
    if ($("#salesAvg")) $("#salesAvg").textContent = money(s.avg, list.length ? list : all);
    if ($("#salesRefunded")) $("#salesRefunded").textContent = money(s.refunded, list.length ? list : all);
    $("#salesPeriod").textContent = b.from === b.to ? b.from : (b.from + " → " + b.to);

    var tbody = $("#salesBody");
    tbody.innerHTML = list.map(function (r) {
      var st = normStatus(r.status);
      var cur = r.currency || "NGN";
      return "<tr><td>" + ReceiptlyVal.sanitize(r.date) + "</td><td>" + ReceiptlyVal.sanitize(r.number) + "</td><td>" +
        ReceiptlyVal.sanitize((r.customer && r.customer.name) || "—") + "</td><td>" +
        ReceiptlyCalc.money(r.grand, cur) + "</td><td>" + ReceiptlyCalc.money(r.paid, cur) + "</td><td>" +
        ReceiptlyCalc.money(r.balance, cur) + "</td><td><span class='pill " +
        (st === "PAID IN FULL" ? "paid" : st === "PARTIALLY PAID" ? "partial" : "unpaid") + "'>" +
        ReceiptlyVal.sanitize(st === "PAID IN FULL" ? "Fully Paid" : st === "PARTIALLY PAID" ? "Partially Paid" : "Unpaid") +
        "</span></td></tr>";
    }).join("") || "<tr><td colspan='7'>No receipts in this period.</td></tr>";

    var days = {};
    list.forEach(function (r) {
      days[r.date] = days[r.date] || [];
      days[r.date].push(r);
    });
    var breakdown = $("#dayBreakdown");
    breakdown.innerHTML = Object.keys(days).sort().map(function (day) {
      var sub = summarize(days[day]);
      return "<div class='stat'><span>" + day + "</span><strong>Sales " + money(sub.sales, days[day]) +
        "</strong><span>Paid " + money(sub.paid, days[day]) + " · Yet to be paid " + money(sub.outstanding, days[day]) + "</span></div>";
    }).join("");
  }

  function downloadCsv() {
    var b = periodBounds();
    var list = all.filter(function (r) { return !r.isDraft && inRange(r, b.from, b.to); });
    ReceiptlyExport.downloadCsv(list);
  }

  function downloadPdf() {
    var node = document.getElementById("salesReport");
    if (!node) return;
    ReceiptlyPdf.download(node, "sales-report").catch(function () {
      ReceiptlyUI.toast("PDF library is still loading.", "error");
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    if (!$("#salesTotal")) return;
    all = await ReceiptlyStorage.getVisibleReceipts();
    render();
    if (window.ReceiptlyAccount && ReceiptlyAccount.ready) await ReceiptlyAccount.ready;
    all = await ReceiptlyStorage.getVisibleReceipts();
    document.addEventListener("receiptly-auth-change", function () {
      all = [];
      render();
      Promise.resolve(ReceiptlyStorage.getVisibleReceipts()).then(function (rows) {
        all = rows || [];
        render();
      }).catch(function () { /* keep empty until next load */ });
    });
    if (window.ReceiptlySync) {
      Promise.resolve(ReceiptlySync.sync()).then(function () {
        return ReceiptlyStorage.getVisibleReceipts();
      }).then(function (rows) {
        all = rows || all;
        render();
      }).catch(function () { /* keep local sales */ });
    }
    $("#salesDay").value = iso(new Date());
    ["salesPreset", "salesFrom", "salesTo", "salesDay"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", render);
    });
    document.querySelectorAll("[data-sales-view]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        view = btn.dataset.salesView;
        render();
      });
    });
    $("#salesCsv").addEventListener("click", downloadCsv);
    $("#salesPdf").addEventListener("click", downloadPdf);
    render();
  });
})();
