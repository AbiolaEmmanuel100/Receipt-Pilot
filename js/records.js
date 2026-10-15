(function () {
  "use strict";

  var $ = function (sel) { return document.querySelector(sel); };
  var all = [];
  var filtered = [];
  var viewing = null;
  var trash = [];

  function startOfWeek(d) {
    var x = new Date(d);
    var day = x.getDay();
    var diff = day === 0 ? 6 : day - 1;
    x.setDate(x.getDate() - diff);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function dateKey(dateStr) {
    if (!dateStr) return "";
    var s = String(dateStr).trim();
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
    var dmy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (dmy) {
      var dd = String(dmy[1]).padStart(2, "0");
      var mm = String(dmy[2]).padStart(2, "0");
      return dmy[3] + "-" + mm + "-" + dd;
    }
    return "";
  }

  function inRange(dateStr, from, to) {
    var key = dateKey(dateStr);
    if (!key) return false;
    return key >= from && key <= to;
  }

  function timeKey(timeStr) {
    var t = String(timeStr || "").trim();
    var m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return "00:00:00";
    return String(m[1]).padStart(2, "0") + ":" + m[2] + ":" + String(m[3] || "00");
  }

  function seqFromNumber(number) {
    var m = String(number || "").match(/(\d+)\s*$/);
    return m ? (parseInt(m[1], 10) || 0) : 0;
  }

  function sortStamp(r) {
    var day = dateKey(r && r.date);
    if (day) return day + "T" + timeKey(r && r.time);
    return String((r && r.createdAt) || "");
  }

  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function applyFilters() {
    var q = ($("#search") && $("#search").value || "").trim().toLowerCase();
    var qNum = ($("#searchNumber") && $("#searchNumber").value || "").trim().toLowerCase();
    var qCust = ($("#searchCustomer") && $("#searchCustomer").value || "").trim().toLowerCase();
    var qPhone = ($("#searchPhone") && $("#searchPhone").value || "").trim().toLowerCase();
    var status = $("#filterStatus").value;
    var method = $("#filterMethod").value;
    var currency = $("#filterCurrency").value;
    var range = $("#filterRange").value;
    var customFrom = $("#dateFrom").value;
    var customTo = $("#dateTo").value;
    var sort = $("#sortBy").value;

    var today = new Date();
    var from = "0000-01-01";
    var to = "9999-12-31";
    if (range === "today") from = to = iso(today);
    else if (range === "yesterday") {
      var y = new Date(today); y.setDate(y.getDate() - 1);
      from = to = iso(y);
    } else if (range === "week") {
      from = iso(startOfWeek(today));
      to = iso(today);
    } else if (range === "month") {
      from = iso(new Date(today.getFullYear(), today.getMonth(), 1));
      to = iso(today);
    } else if (range === "lastMonth") {
      from = iso(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      to = iso(new Date(today.getFullYear(), today.getMonth(), 0));
    } else if (range === "year") {
      from = iso(new Date(today.getFullYear(), 0, 1));
      to = iso(today);
    } else if (range === "custom") {
      from = customFrom || from;
      to = customTo || to;
    }

    filtered = all.filter(function (r) {
      if (range !== "all" && !inRange(r.date, from, to)) return false;
      if (status !== "all") {
        var rs = r.status === "PAID" ? "PAID IN FULL" : r.status;
        if (rs !== status) return false;
      }
      if (method !== "all" && r.payment !== method) return false;
      if (currency !== "all" && r.currency !== currency) return false;
      if (qNum && String(r.number || "").toLowerCase().indexOf(qNum) === -1) return false;
      if (qCust && String((r.customer && r.customer.name) || "").toLowerCase().indexOf(qCust) === -1) return false;
      if (qPhone && String((r.customer && r.customer.phone) || "").toLowerCase().indexOf(qPhone) === -1) return false;
      if (q) {
        var hay = [
          r.number, r.notes,
          r.customer && r.customer.name,
          r.customer && r.customer.phone,
          r.customer && r.customer.email,
          r.business && r.business.name
        ].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    filtered.sort(function (a, b) {
      if (sort === "high") return (b.grand || 0) - (a.grand || 0);
      if (sort === "low") return (a.grand || 0) - (b.grand || 0);
      if (sort === "number") return String(a.number).localeCompare(String(b.number));
      var sa = sortStamp(a);
      var sb = sortStamp(b);
      if (sa !== sb) {
        if (sort === "oldest") return sa > sb ? 1 : -1;
        return sa < sb ? 1 : -1;
      }
      var na = seqFromNumber(a.number);
      var nb = seqFromNumber(b.number);
      if (na !== nb) return sort === "oldest" ? na - nb : nb - na;
      return 0;
    });

    renderSummary();
    renderTable();
  }

  function totals(list) {
    var sales = 0, paid = 0, outstanding = 0, paidN = 0, partN = 0, unpaidN = 0, n = 0;
    list.forEach(function (r) {
      if (r.isDraft) return;
      n++;
      sales += Number(r.grand) || 0;
      paid += Number(r.paid) || 0;
      outstanding += Math.max(0, Number(r.balance) || 0);
      if (r.status === "PAID" || r.status === "PAID IN FULL") paidN++;
      else if (r.status === "PARTIALLY PAID") partN++;
      else unpaidN++;
    });
    return {
      count: n,
      sales: sales,
      paid: paid,
      outstanding: outstanding,
      avg: n ? sales / n : 0,
      paidN: paidN,
      partN: partN,
      unpaidN: unpaidN
    };
  }

  function moneyMix(amount, list) {
    var codes = {};
    list.forEach(function (r) { codes[r.currency || "NGN"] = true; });
    var keys = Object.keys(codes);
    if (keys.length === 1) return ReceiptlyCalc.money(amount, keys[0]);
    return ReceiptlyCalc.money(amount, "NGN") + "*";
  }

  function renderSummary() {
    var rangeEl = $("#filterRange");
    var rangeVal = rangeEl ? rangeEl.value : "all";
    var q = ($("#search") && $("#search").value || "").trim();
    var filteredActive = rangeVal !== "all" || q ||
      ($("#searchNumber") && $("#searchNumber").value) ||
      ($("#searchCustomer") && $("#searchCustomer").value) ||
      ($("#searchPhone") && $("#searchPhone").value) ||
      ($("#filterStatus") && $("#filterStatus").value !== "all") ||
      ($("#filterMethod") && $("#filterMethod").value !== "all") ||
      ($("#filterCurrency") && $("#filterCurrency").value !== "all");
    var tAll = totals(all);
    var t = totals(filtered);
    var kpi = filteredActive ? t : tAll;
    var kpiSrc = filteredActive ? filtered : all;
    $("#statSales").textContent = moneyMix(kpi.sales, kpiSrc);
    $("#statPaid").textContent = moneyMix(kpi.paid, kpiSrc);
    $("#statOut").textContent = moneyMix(kpi.outstanding, kpiSrc);
    $("#statCount").textContent = String(kpi.count);

    $("#auditCount").textContent = String(t.count);
    $("#auditSales").textContent = moneyMix(t.sales, filtered);
    $("#auditPaid").textContent = moneyMix(t.paid, filtered);
    $("#auditOut").textContent = moneyMix(t.outstanding, filtered);
    $("#auditAvg").textContent = moneyMix(t.avg, filtered);
    $("#auditPaidN").textContent = String(t.paidN);
    $("#auditPartN").textContent = String(t.partN);
    $("#auditUnpaidN").textContent = String(t.unpaidN);
    var note = $("#mixNote");
    if (note) {
      var codes = {};
      all.forEach(function (r) { codes[r.currency || "NGN"] = true; });
      note.hidden = Object.keys(codes).length <= 1;
    }
  }

  function statusBadge(r) {
    if (r.voided) return '<span class="pill cancelled">Cancelled</span>';
    if (r.refunded) return '<span class="pill refunded">Refunded</span>';
    var st = r.status === "PAID" ? "PAID IN FULL" : (r.status || "UNPAID");
    if (st === "PAID IN FULL") return '<span class="pill paid">Paid in Full</span>';
    if (st === "PARTIALLY PAID") return '<span class="pill partial">Partially Paid</span>';
    return '<span class="pill unpaid">Unpaid</span>';
  }

  function renderTable() {
    var empty = $("#emptyState");
    var tableWrap = $("#tableWrap");
    if (!all.length) {
      empty.hidden = false;
      tableWrap.hidden = true;
      return;
    }
    empty.hidden = true;
    tableWrap.hidden = false;
    var tbody = $("#recordsBody");
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="8">No receipts match these filters.</td></tr>';
      $("#cards").innerHTML = "<p class='hint'>No receipts match these filters.</p>";
      return;
    }
    tbody.innerHTML = filtered.map(function (r) {
      var cur = r.currency || "NGN";
      return "<tr>" +
        "<td class='col-num'>" + ReceiptlyVal.sanitize(r.number) + (r.isDraft ? ' <span class="pill">Draft</span>' : "") + "</td>" +
        "<td>" + ReceiptlyVal.sanitize(r.date || "") + "</td>" +
        "<td>" + ReceiptlyVal.sanitize((r.customer && r.customer.name) || "—") + "</td>" +
        "<td class='col-amt'>" + ReceiptlyCalc.money(r.grand, cur) + "</td>" +
        "<td>" + statusBadge(r) + "</td>" +
        "<td>" + ReceiptlyVal.sanitize((r.business && r.business.name) || "—") + "</td>" +
        "<td>" + ReceiptlyVal.sanitize(String(r.createdAt || "").slice(0, 10)) + "</td>" +
        "<td class='row-actions'>" + actions(r.id) + "</td></tr>";
    }).join("");

    $("#cards").innerHTML = filtered.map(function (r) {
      var cur = r.currency || "NGN";
      return '<article class="record-card">' +
        "<h3>" + ReceiptlyVal.sanitize(r.number) + "</h3>" +
        "<p>" + ReceiptlyVal.sanitize((r.customer && r.customer.name) || "—") + "</p>" +
        "<p>" + ReceiptlyVal.sanitize(r.date) + "</p>" +
        "<p class='card-amt'>" + ReceiptlyCalc.money(r.grand, cur) + "</p>" +
        "<p>" + statusBadge(r) + "</p>" +
        '<div class="row-actions">' + actions(r.id) + "</div></article>";
    }).join("");
  }

  function actions(id) {
    return '<button type="button" class="btn btn-sm btn-secondary" data-act="view" data-id="' + id + '">View</button>' +
      '<div class="more-wrap">' +
        '<button type="button" class="btn btn-sm btn-ghost more-btn" data-more="1" aria-label="More actions">⋯</button>' +
        '<div class="more-menu" hidden>' +
          '<button type="button" data-act="send" data-id="' + id + '">Send</button>' +
          '<button type="button" data-act="pdf" data-id="' + id + '">PDF</button>' +
          '<button type="button" data-act="image" data-id="' + id + '">Image</button>' +
          '<button type="button" data-act="dup" data-id="' + id + '">Create Again</button>' +
          '<button type="button" data-act="void" data-id="' + id + '">Cancel Receipt</button>' +
          '<button type="button" data-act="refund" data-id="' + id + '">Refund</button>' +
          '<button type="button" class="more-danger" data-act="del" data-id="' + id + '">Delete</button>' +
        "</div></div>";
  }

  function findRecord(id) {
    return all.find(function (r) { return r.id === id; }) ||
      trash.find(function (r) { return r.id === id; }) ||
      null;
  }

  function openView(id) {
    var rec = findRecord(id);
    if (!rec) return;
    viewing = rec;
    if ($("#viewPreview")) ReceiptlyReceipt.render(rec, $("#viewPreview"));
    if ($("#previewMount")) ReceiptlyReceipt.render(rec, $("#previewMount"));
    var inTrash = !!rec.deletedAt;
    if ($("#viewNumber")) $("#viewNumber").textContent = rec.number + (inTrash ? " (Trash)" : "");
    if ($("#previewSub")) {
      $("#previewSub").textContent = inTrash
        ? (rec.number || "") + " · In Trash"
        : (rec.number || "");
    }
    var hist = $("#viewHistory");
    if (hist) {
      var bits = (rec.versions || []).map(function (v) {
        var act = v.action || "";
        if (act === "voided") act = "cancelled";
        return ReceiptlyVal.sanitize((v.at || "").slice(0, 16).replace("T", " ")) + " — " + ReceiptlyVal.sanitize(act);
      });
      hist.innerHTML = bits.length ? bits.join("<br>") : "No edits recorded.";
    }
    if ($("#viewPanel")) $("#viewPanel").hidden = true;
    if ($("#previewDialog")) $("#previewDialog").hidden = false;
  }

  function selectedTrashIds() {
    return Array.prototype.map.call(document.querySelectorAll("#trashBody input[type=checkbox]:checked"), function (el) {
      return el.value;
    });
  }

  async function loadTrash() {
    if (window.ReceiptlyStorage && ReceiptlyStorage.purgeExpiredTrash) {
      await ReceiptlyStorage.purgeExpiredTrash();
    }
    trash = await ReceiptlyStorage.getTrashedReceipts();
    var daysEl = $("#trashDays");
    if (daysEl && ReceiptlyStorage.TRASH_DAYS) daysEl.textContent = String(ReceiptlyStorage.TRASH_DAYS);
    renderTrash();
  }

  function renderTrash() {
    var empty = $("#trashEmpty");
    var wrap = $("#trashWrap");
    var body = $("#trashBody");
    if (!empty || !wrap || !body) return;
    if (!trash.length) {
      empty.hidden = false;
      wrap.hidden = true;
      body.innerHTML = "";
      return;
    }
    empty.hidden = true;
    wrap.hidden = false;
    body.innerHTML = trash.map(function (r) {
      var cur = r.currency || "NGN";
      return "<tr>" +
        '<td><input type="checkbox" value="' + ReceiptlyVal.sanitize(r.id) + '"></td>' +
        "<td>" + ReceiptlyVal.sanitize(r.number) + "</td>" +
        "<td>" + ReceiptlyVal.sanitize((r.customer && r.customer.name) || "—") + "</td>" +
        "<td>" + ReceiptlyCalc.money(r.grand, cur) + "</td>" +
        "<td>" + ReceiptlyVal.sanitize(String(r.deletedAt || "").slice(0, 10)) + "</td>" +
        '<td class="row-actions">' +
          '<button type="button" class="btn btn-sm btn-secondary" data-act="view-trash" data-id="' + r.id + '">View</button>' +
          '<button type="button" class="btn btn-sm btn-secondary" data-act="restore" data-id="' + r.id + '">Restore</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-act="purge" data-id="' + r.id + '">Delete Permanently</button>' +
        "</td></tr>";
    }).join("");
  }

  async function restoreIds(ids) {
    for (var i = 0; i < ids.length; i++) {
      await ReceiptlyStorage.restoreReceipt(ids[i]);
    }
    all = await ReceiptlyStorage.getVisibleReceipts();
    await loadTrash();
    applyFilters();
    ids.forEach(function (id) {
      if (window.ReceiptlySync && ReceiptlySync.pushOne) {
        ReceiptlyStorage.getReceipt(id).then(function (rec) {
          if (rec) ReceiptlySync.pushOne(rec);
        });
      }
    });
  }

  async function handleAction(act, id) {
    if (act === "view" || act === "view-trash") {
      openView(id);
      if (window.ReceiptlyAnalytics) ReceiptlyAnalytics.track("receipt_record_viewed", { page: "records" });
    }
    if (act === "edit") {
      if (window.ReceiptlyAnalytics) ReceiptlyAnalytics.track("receipt_edited", { page: "records" });
      location.href = "index.html?edit=" + encodeURIComponent(id);
    }
    if (act === "dup") {
      if (window.ReceiptlyAnalytics) ReceiptlyAnalytics.track("receipt_duplicated", { page: "records" });
      location.href = "index.html?duplicate=" + encodeURIComponent(id);
    }
    if (act === "del") {
      var okDel = await ReceiptlyUI.confirm({
        title: "Delete Receipt?",
        message: "Are you sure you want to delete this receipt? You can restore it from Trash.",
        confirmLabel: "Delete",
        danger: true
      });
      if (!okDel) return;
      var going = all.find(function (r) { return r.id === id; });
      await ReceiptlyStorage.trashReceipt(id);
      all = all.filter(function (r) { return r.id !== id; });
      if (viewing && viewing.id === id) {
        $("#viewPanel").hidden = true;
        if ($("#previewDialog")) $("#previewDialog").hidden = true;
        viewing = null;
      }
      await loadTrash();
      applyFilters();
      ReceiptlyUI.toast("Receipt deleted");
      if (window.ReceiptlyActivity) ReceiptlyActivity.log("receipt_deleted", { number: going && going.number });
      if (window.ReceiptlyAnalytics) ReceiptlyAnalytics.track("receipt_deleted", { page: "records" });
      if (window.ReceiptlySync && ReceiptlySync.remove) {
        Promise.resolve(ReceiptlySync.remove(id)).catch(function () { /* local trash already applied */ });
      }
    }
    if (act === "void") {
      var okVoid = await ReceiptlyUI.confirm({
        title: "Cancel Receipt?",
        message: "Mark this receipt as cancelled? The original record stays in History.",
        confirmLabel: "Cancel Receipt",
        danger: true
      });
      if (!okVoid) return;
      var recV = all.find(function (r) { return r.id === id; });
      if (!recV) return;
      recV.voided = true;
      recV.updatedAt = new Date().toISOString();
      recV.syncStatus = "pending";
      recV.versions = (recV.versions || []).concat([{ at: recV.updatedAt, action: "voided" }]);
      await ReceiptlyStorage.saveReceipt(recV);
      if (window.ReceiptlySync && ReceiptlySync.pushOne) await ReceiptlySync.pushOne(recV);
      applyFilters();
      ReceiptlyUI.toast("Receipt marked as cancelled. It remains in your records.");
      if (window.ReceiptlyActivity) ReceiptlyActivity.log("receipt_voided", { number: recV.number });
      return;
    }
    if (act === "refund") {
      var okRef = await ReceiptlyUI.confirm({
        title: "Refund Receipt?",
        message: "Mark this receipt as refunded? The original record stays in History.",
        confirmLabel: "Refund",
        danger: true
      });
      if (!okRef) return;
      var recR = all.find(function (r) { return r.id === id; });
      if (!recR) return;
      recR.refunded = true;
      recR.updatedAt = new Date().toISOString();
      recR.syncStatus = "pending";
      recR.versions = (recR.versions || []).concat([{ at: recR.updatedAt, action: "refunded" }]);
      await ReceiptlyStorage.saveReceipt(recR);
      if (window.ReceiptlySync && ReceiptlySync.pushOne) await ReceiptlySync.pushOne(recR);
      applyFilters();
      ReceiptlyUI.toast("Receipt marked refunded. It remains in your records.");
      if (window.ReceiptlyActivity) ReceiptlyActivity.log("receipt_refunded", { number: recR.number });
      return;
    }
    if (act === "restore") {
      await restoreIds([id]);
      ReceiptlyUI.toast("Receipt restored");
      if (window.ReceiptlyActivity) ReceiptlyActivity.log("receipt_restored");
      return;
    }
    if (act === "purge") {
      var okPurge = await ReceiptlyUI.confirm({
        title: "Permanently delete this receipt?",
        message: "This action cannot be undone.",
        confirmLabel: "Permanently Delete",
        danger: true
      });
      if (!okPurge) return;
      if (window.ReceiptlySync && ReceiptlySync.purge) await ReceiptlySync.purge(id);
      else await ReceiptlyStorage.purgeReceipt(id);
      await loadTrash();
      ReceiptlyUI.toast("Receipt permanently deleted.");
      return;
    }
    if (act === "send") {
      var recSend = all.find(function (r) { return r.id === id; });
      if (recSend && window.ReceiptlyShare) ReceiptlyShare.open(recSend);
    }
    if (act === "image") {
      var recImg = all.find(function (r) { return r.id === id; });
      if (!recImg || !window.ReceiptlyShare) return;
      ReceiptlyShare.downloadImage(recImg).then(function () {
        ReceiptlyUI.toast("Receipt downloaded");
      }).catch(function () {
        ReceiptlyUI.toast("Could not create the image.", "error");
      });
    }
    if (act === "pdf" || act === "print") {
      var rec = all.find(function (r) { return r.id === id; });
      if (!rec) return;
      ReceiptlyReceipt.render(rec, $("#viewPreview"));
      $("#viewPanel").hidden = false;
      viewing = rec;
      if (act === "print") {
        setTimeout(function () { window.print(); }, 50);
        if (window.ReceiptlyAnalytics) ReceiptlyAnalytics.track("receipt_printed", { page: "records" });
      }
      if (act === "pdf") {
        try {
          await ReceiptlyPdf.download($("#viewPreview"), rec.number);
          if (window.ReceiptlyAnalytics) ReceiptlyAnalytics.track("receipt_downloaded", { page: "records" });
        } catch (e) {
          if (window.ReceiptlyErrors) ReceiptlyErrors.report("pdf failed", "records");
          ReceiptlyUI.toast("PDF library is still loading. Try again.", "error");
        }
      }
    }
  }

  function bind() {
    ["search", "searchNumber", "searchCustomer", "searchPhone", "filterStatus", "filterMethod", "filterCurrency", "filterRange", "sortBy", "dateFrom", "dateTo"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", applyFilters);
      el.addEventListener("change", applyFilters);
    });
    $("#filterRange").addEventListener("change", function () {
      var custom = $("#filterRange").value === "custom";
      $("#customDates").hidden = !custom;
      if (custom && $("#moreFilters")) $("#moreFilters").open = true;
    });

    function resetMoreMenuPos(m) {
      if (!m || !m.style) return;
      m.style.position = "";
      m.style.top = "";
      m.style.left = "";
      m.style.right = "";
      m.style.bottom = "";
      m.style.zIndex = "";
    }
    function placeMoreMenuMobile(btn, menu) {
      if (!menu || !btn || window.innerWidth > 900) return;
      var r = btn.getBoundingClientRect();
      var w = Math.min(200, window.innerWidth - 16);
      var left = r.right - w;
      if (left < 8) left = 8;
      if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
      var top = r.bottom + 4;
      menu.style.position = "fixed";
      menu.style.right = "auto";
      menu.style.bottom = "auto";
      menu.style.left = left + "px";
      menu.style.top = top + "px";
      menu.style.zIndex = "80";
    }
    document.addEventListener("click", function (e) {
      var moreBtn = e.target.closest("[data-more]");
      if (moreBtn) {
        e.stopPropagation();
        var wrap = moreBtn.closest(".more-wrap");
        var menu = wrap && wrap.querySelector(".more-menu");
        var wasOpen = menu && !menu.hidden;
        document.querySelectorAll(".more-menu").forEach(function (m) {
          m.hidden = true;
          resetMoreMenuPos(m);
        });
        if (menu) {
          menu.hidden = !!wasOpen;
          if (!menu.hidden) placeMoreMenuMobile(moreBtn, menu);
        }
        return;
      }
      if (!e.target.closest(".more-menu")) {
        document.querySelectorAll(".more-menu").forEach(function (m) {
          m.hidden = true;
          resetMoreMenuPos(m);
        });
      }
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      handleAction(btn.dataset.act, btn.dataset.id);
    });

    $("#viewEdit").addEventListener("click", function () {
      if (!viewing) return;
      if (window.ReceiptlyAnalytics) ReceiptlyAnalytics.track("receipt_edited", { page: "records" });
      location.href = "index.html?edit=" + encodeURIComponent(viewing.id);
    });
    $("#viewDup").addEventListener("click", function () {
      if (!viewing) return;
      if (window.ReceiptlyAnalytics) ReceiptlyAnalytics.track("receipt_duplicated", { page: "records" });
      location.href = "index.html?duplicate=" + encodeURIComponent(viewing.id);
    });
    var viewImage = $("#viewImage");
    if (viewImage) viewImage.addEventListener("click", function () {
      if (!viewing || !window.ReceiptlyShare) return;
      ReceiptlyShare.downloadImage(viewing).then(function () {
        ReceiptlyUI.toast("Receipt downloaded");
      }).catch(function () {
        ReceiptlyUI.toast("Could not create the image.", "error");
      });
    });
    $("#viewPdf").addEventListener("click", async function () {
      if (!viewing) return;
      try {
        await ReceiptlyPdf.download($("#viewPreview"), viewing.number);
        if (window.ReceiptlyAnalytics) ReceiptlyAnalytics.track("receipt_downloaded", { page: "records" });
      } catch (e) { ReceiptlyUI.toast("PDF library is still loading. Try again.", "error"); }
    });
    var viewSend = $("#viewSend");
    if (viewSend) viewSend.addEventListener("click", function () {
      if (!viewing) return;
      if (window.ReceiptlyShare) ReceiptlyShare.open(viewing);
    });
    $("#viewPrint").addEventListener("click", function () {
      window.print();
      if (window.ReceiptlyAnalytics) ReceiptlyAnalytics.track("receipt_printed", { page: "records" });
    });
    $("#viewBack").addEventListener("click", function () {
      $("#viewPanel").hidden = true;
      if ($("#previewDialog")) $("#previewDialog").hidden = true;
      viewing = null;
    });
    var previewClose = $("#previewClose");
    if (previewClose) previewClose.addEventListener("click", function () {
      if ($("#previewDialog")) $("#previewDialog").hidden = true;
    });
    var previewDlg = $("#previewDialog");
    if (previewDlg) previewDlg.addEventListener("click", function (e) {
      if (e.target.id === "previewDialog") $("#previewDialog").hidden = true;
    });

    $("#exportCsv").addEventListener("click", function () {
      ReceiptlyExport.downloadCsv(filtered.length ? filtered : all);
      if (window.ReceiptlyAnalytics) ReceiptlyAnalytics.track("csv_exported", { page: "records" });
    });
    $("#backupBtn").addEventListener("click", async function () {
      var payload = await ReceiptlyStorage.exportAll();
      ReceiptlyExport.downloadBackup(payload);
      if (window.ReceiptlyAnalytics) ReceiptlyAnalytics.track("backup_created", { page: "records" });
    });
    $("#restoreBtn").addEventListener("click", function () { $("#restoreFile").click(); });
    $("#restoreFile").addEventListener("change", async function (e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        var text = await file.text();
        var payload = JSON.parse(text);
        if (!payload || !Array.isArray(payload.receipts)) throw new Error("format");
        var go = await ReceiptlyUI.confirm({
          title: "Restore backup?",
          message: "Restore " + payload.receipts.length + " receipt(s) from this backup? Existing records with the same ID will be updated.",
          confirmLabel: "Continue"
        });
        if (!go) return;
        var choice = await ReceiptlyUI.confirm({
          title: "How should this backup be restored?",
          message: "Merge keeps current receipts and updates matching IDs. Replace removes records that exist only on this device.",
          confirmLabel: "Merge",
          extraLabel: "Replace",
          extraDanger: true
        });
        if (!choice) return;
        var mode = choice === "extra" ? "replace" : "merge";
        if (mode === "replace") {
          var sure = await ReceiptlyUI.confirm({
            title: "Replace all records?",
            message: "Replace will permanently remove records that are only on this device.",
            confirmLabel: "Replace",
            danger: true
          });
          if (!sure) return;
        }
        var uid = window.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId();
        var foreign = false;
        if (uid) {
          (payload.receipts || []).forEach(function (src) {
            if (src && src.userId && src.userId !== uid) foreign = true;
          });
        }
        if (foreign) {
          var take = await ReceiptlyUI.confirm({
            title: "This backup is from another account",
            message: "This backup was created from another Receipt Pilot account. Importing it will add/restore its receipts and business information into your current account. Do you want to continue?",
            confirmLabel: "Import anyway",
            danger: true
          });
          if (!take) return;
        }
        await ReceiptlyStorage.importAll(payload, mode);
        if (window.ReceiptlySync) ReceiptlySync.sync();
        all = await ReceiptlyStorage.getVisibleReceipts();
        applyFilters();
        ReceiptlyUI.toast("Backup restored.");
        if (window.ReceiptlyAnalytics) ReceiptlyAnalytics.track("backup_restored", { page: "records" });
      } catch (err) {
        ReceiptlyUI.toast("That file could not be restored. Check it is a Receipt Pilot backup.", "error");
      }
    });
    $("#clearAll").addEventListener("click", async function () {
      var first = await ReceiptlyUI.confirm({
        title: "Clear all records?",
        message: "This permanently deletes records stored in this browser.",
        confirmLabel: "Continue",
        danger: true
      });
      if (!first) return;
      var second = await ReceiptlyUI.confirm({
        title: "Delete all saved receipts?",
        message: "This cannot be undone.",
        confirmLabel: "Delete",
        danger: true
      });
      if (!second) return;
      await ReceiptlyStorage.clearReceipts();
      if (window.ReceiptlySync) ReceiptlySync.sync();
      all = [];
      applyFilters();
      $("#viewPanel").hidden = true;
      if ($("#previewDialog")) $("#previewDialog").hidden = true;
      ReceiptlyUI.toast("All records cleared.");
    });
    var restoreSelected = $("#restoreSelected");
    if (restoreSelected) restoreSelected.addEventListener("click", async function () {
      var ids = selectedTrashIds();
      if (!ids.length) {
        ReceiptlyUI.toast("Select at least one receipt.", "error");
        return;
      }
      await restoreIds(ids);
      ReceiptlyUI.toast("Selected receipts restored");
    });
    var restoreAllBtn = $("#restoreAll");
    if (restoreAllBtn) restoreAllBtn.addEventListener("click", async function () {
      if (!(window.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId())) {
        ReceiptlyUI.toast("Please log in to restore your receipt history.", "error");
        if (window.ReceiptlyAccount && ReceiptlyAccount.showLogin) ReceiptlyAccount.showLogin();
        return;
      }
      var okAll = await ReceiptlyUI.confirm({
        title: "Restore all receipts?",
        message: "Restore all " + trash.length + " receipt(s) from Trash to your account?",
        confirmLabel: "Restore"
      });
      if (!okAll) return;
      var result = await ReceiptlySync.restoreAll();
      if (result && result.needAuth) {
        ReceiptlyUI.toast("Please log in to restore your receipt history.", "error");
        ReceiptlyAccount.showLogin();
        return;
      }
      all = await ReceiptlyStorage.getVisibleReceipts();
      await loadTrash();
      applyFilters();
      ReceiptlyUI.toast("All recoverable receipts have been restored.");
    });
    var purgeSelected = $("#purgeSelected");
    if (purgeSelected) purgeSelected.addEventListener("click", async function () {
      var ids = selectedTrashIds();
      if (!ids.length) {
        ReceiptlyUI.toast("Select at least one receipt.", "error");
        return;
      }
      var okSel = await ReceiptlyUI.confirm({
        title: "Permanently delete selected receipts?",
        message: "This action cannot be undone.",
        confirmLabel: "Permanently Delete",
        danger: true
      });
      if (!okSel) return;
      for (var i = 0; i < ids.length; i++) {
        if (window.ReceiptlySync && ReceiptlySync.purge) await ReceiptlySync.purge(ids[i]);
        else await ReceiptlyStorage.purgeReceipt(ids[i]);
      }
      await loadTrash();
      ReceiptlyUI.toast("Selected receipts permanently deleted.");
    });
  }

  async function boot() {
    if (!$("#recordsBody")) return;
    bind();
    var empty = $("#emptyState");
    if (empty) {
      empty.hidden = false;
      var h = empty.querySelector("h2");
      var p = empty.querySelector("p");
      if (h) h.textContent = "Loading…";
      if (p) p.textContent = "Fetching your receipts.";
    }
    async function reloadFromStorage() {
      all = await ReceiptlyStorage.getVisibleReceipts();
      await loadTrash();
      applyFilters();
      if (window.ReceiptlyActivity && $("#activityList")) {
        var acts = await ReceiptlyActivity.list();
        function paintActivity(n) {
          $("#activityList").innerHTML = acts.slice(0, n).map(function (a) {
            var act = String(a.action || "").replace("receipt_voided", "receipt cancelled").replace(/_/g, " ");
            return "<li>" + ReceiptlyVal.sanitize((a.at || "").slice(0, 16).replace("T", " ")) +
              " — " + ReceiptlyVal.sanitize(act) +
              (a.number ? " (" + ReceiptlyVal.sanitize(a.number) + ")" : "") + "</li>";
          }).join("") || "<li>No activity yet.</li>";
          var more = $("#activityMore");
          if (more) more.hidden = acts.length <= n;
        }
        paintActivity(5);
        var moreBtn = $("#activityMore");
        if (moreBtn) moreBtn.onclick = function () { paintActivity(acts.length); };
      }
    }
    try {
      await reloadFromStorage();
      if (window.ReceiptlyAccount && ReceiptlyAccount.ready) await ReceiptlyAccount.ready;
      await reloadFromStorage();
      document.addEventListener("receiptly-auth-change", function () {
        all = [];
        trash = [];
        viewing = null;
        if ($("#previewDialog")) $("#previewDialog").hidden = true;
        if ($("#viewPanel")) $("#viewPanel").hidden = true;
        if ($("#confirmDialog")) $("#confirmDialog").hidden = true;
        if ($("#shareDialog")) $("#shareDialog").hidden = true;
        applyFilters();
        Promise.resolve(reloadFromStorage()).catch(function () { /* keep empty until next load */ });
      });
      if (window.ReceiptlySync) {
        Promise.resolve(ReceiptlySync.sync()).then(function () {
          return ReceiptlyStorage.getVisibleReceipts();
        }).then(function (rows) {
          all = rows || [];
          return loadTrash();
        }).then(function () { applyFilters(); }).catch(function () { /* keep local list */ });
      }
      var notice = $("#historyNotice");
      if (notice && window.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId()) {
        notice.textContent = "These receipts belong to your signed-in account. Other businesses cannot see them.";
      }
    } catch (e) {
      ReceiptlyUI.toast("Unable to load records.", "error");
      all = [];
    }
    if (empty) {
      var h2 = empty.querySelector("h2");
      var p2 = empty.querySelector("p");
      if (h2) h2.textContent = "No receipts yet";
      if (p2) p2.textContent = "Create your first receipt to get started.";
    }
    applyFilters();
    var viewId = new URLSearchParams(location.search).get("view");
    if (viewId) openView(viewId);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
