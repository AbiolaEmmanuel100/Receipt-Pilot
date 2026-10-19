(function () {
  "use strict";

  var statusEl = document.getElementById("acctStatus");
  var warningsEl = document.getElementById("acctWarnings");
  var cards = document.getElementById("summaryCards");
  var receiptRows = document.getElementById("receiptRows");
  var paymentReceipt = document.getElementById("paymentReceipt");
  var refundReceipt = document.getElementById("refundReceipt");
  var saving = false;

  function money(value) {
    return "₦" + Number(value || 0).toFixed(2);
  }

  function text(value) {
    return document.createTextNode(value == null ? "" : String(value));
  }

  function userId() {
    return window.ReceiptlyAccount && ReceiptlyAccount.userId ? ReceiptlyAccount.userId() : "";
  }

  function range() {
    var preset = document.getElementById("periodPreset").value;
    var now = new Date();
    var from = new Date(now);
    var to = new Date(now);
    if (preset === "today") {
      from = now;
    } else if (preset === "week") {
      var day = (now.getDay() + 6) % 7;
      from.setDate(now.getDate() - day);
    } else if (preset === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      return {
        from: document.getElementById("fromDate").value,
        to: document.getElementById("toDate").value
      };
    }
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }

  function inRange(date, bounds) {
    if (!date || !bounds.from || !bounds.to) return true;
    return date >= bounds.from && date <= bounds.to;
  }

  function card(label, value) {
    var div = document.createElement("div");
    div.className = "acct-card";
    div.appendChild(text(label));
    var strong = document.createElement("strong");
    strong.textContent = value;
    div.appendChild(strong);
    return div;
  }

  async function cloud() {
    return window.ReceiptlyCloud && ReceiptlyCloud.ready ? ReceiptlyCloud.ready() : null;
  }

  async function load() {
    if (!userId()) {
      statusEl.textContent = "Sign in to load accounting records from your account.";
      return;
    }
    var sb = await cloud();
    if (!sb) {
      statusEl.textContent = "Unable to reach Receipt Pilot cloud right now.";
      return;
    }
    var bounds = range();
    var receiptsRes = await sb.from("receipts").select("id,receipt_number,customer_name,total,amount_paid,outstanding,payment_status,receipt_date,deleted_at").is("deleted_at", null);
    if (receiptsRes.error) throw receiptsRes.error;
    var expensesRes = await sb.from("expenses").select("amount,expense_date,category");
    var productsRes = await sb.from("products").select("name,stock_qty,unit_cost,selling_price,low_stock_threshold,archived_at");
    var refundsRes = await sb.from("refunds").select("amount,status,refunded_on");
    var receipts = (receiptsRes.data || []).filter(function (row) { return inRange(row.receipt_date, bounds); });
    var expenses = expensesRes.error ? [] : (expensesRes.data || []).filter(function (row) { return inRange(row.expense_date, bounds); });
    var products = productsRes.error ? [] : (productsRes.data || []);
    var refunds = refundsRes.error ? [] : (refundsRes.data || []).filter(function (row) { return inRange(row.refunded_on, bounds); });

    var sales = 0, collected = 0, outstanding = 0, unpaid = 0, partial = 0;
    receipts.forEach(function (row) {
      sales += Number(row.total || 0);
      collected += Number(row.amount_paid || 0);
      outstanding += Number(row.outstanding || 0);
      if (row.payment_status === "UNPAID") unpaid += 1;
      if (row.payment_status === "PARTIAL") partial += 1;
    });
    var expenseTotal = expenses.reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
    var completedRefunds = refunds.filter(function (row) { return row.status === "completed"; })
      .reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
    var lowStock = products.filter(function (row) { return !row.archived_at && Number(row.stock_qty) <= Number(row.low_stock_threshold); }).length;
    var knownStockValue = products.reduce(function (sum, row) {
      return row.unit_cost == null ? sum : sum + Number(row.unit_cost) * Number(row.stock_qty || 0);
    }, 0);
    var missingCost = products.some(function (row) { return row.unit_cost == null; });

    cards.textContent = "";
    [
      ["Sales recorded", money(sales)],
      ["Cash collected", money(collected)],
      ["Outstanding", money(outstanding)],
      ["Net cash after completed refunds", money(collected - completedRefunds)],
      ["Operating expenses", money(expenseTotal)],
      ["Gross profit", missingCost ? "Estimate incomplete" : "Profit unavailable"],
      ["Low-stock products", String(lowStock)],
      ["Known stock value", money(knownStockValue)]
    ].forEach(function (item) { cards.appendChild(card(item[0], item[1])); });

    warningsEl.textContent = [
      "Sales use receipt totals. Cash collected uses existing amount_paid and does not invent historic payment dates.",
      unpaid + " unpaid and " + partial + " partially paid receipts are in this period.",
      missingCost ? "Some products have unknown cost, so profit is not calculated." : "Product costs are not linked to historic receipt lines, so profit remains unavailable.",
      refundsRes.error ? "Refund history needs migration 012." : "Only completed refunds reduce net cash."
    ].join(" ");
    statusEl.textContent = "Loaded from your account for " + bounds.from + " to " + bounds.to + ".";

    receiptRows.textContent = "";
    paymentReceipt.textContent = "";
    refundReceipt.textContent = "";
    receipts.forEach(function (row) {
      var tr = document.createElement("tr");
      [row.receipt_number, row.customer_name || "—", money(row.total), money(row.amount_paid), money(row.outstanding), row.payment_status].forEach(function (value, index) {
        var td = document.createElement("td");
        if (index >= 2 && index <= 4) td.className = "col-num";
        td.appendChild(text(value));
        tr.appendChild(td);
      });
      receiptRows.appendChild(tr);
      if (Number(row.outstanding) > 0) {
        var option = document.createElement("option");
        option.value = row.id;
        option.textContent = row.receipt_number + " · outstanding " + money(row.outstanding);
        paymentReceipt.appendChild(option);
      }
      var refundOption = document.createElement("option");
      refundOption.value = row.id;
      refundOption.textContent = row.receipt_number;
      refundReceipt.appendChild(refundOption);
    });
  }

  document.getElementById("periodForm").addEventListener("submit", function (event) {
    event.preventDefault();
    load().catch(function () { statusEl.textContent = "Unable to load accounting records."; });
  });

  document.getElementById("paymentForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (saving) return;
    saving = true;
    var error = document.getElementById("paymentError");
    error.textContent = "";
    try {
      var sb = await cloud();
      var key = "pay-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      var res = await sb.rpc("apply_receipt_payment", {
        p_receipt_id: document.getElementById("paymentReceipt").value,
        p_amount: Number(document.getElementById("paymentAmount").value),
        p_method: document.getElementById("paymentMethod").value,
        p_paid_on: document.getElementById("paymentDate").value,
        p_reference: document.getElementById("paymentReference").value.trim(),
        p_notes: document.getElementById("paymentNotes").value.trim(),
        p_idempotency_key: key
      });
      if (res.error) throw res.error;
      statusEl.textContent = "Payment saved to your account.";
      await load();
    } catch (err) {
      error.textContent = String((err && err.message) || "Unable to save that payment.");
    } finally {
      saving = false;
    }
  });

  document.getElementById("refundForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (saving) return;
    saving = true;
    var error = document.getElementById("refundError");
    error.textContent = "";
    try {
      var sb = await cloud();
      var key = "refund-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      var res = await sb.rpc("record_refund", {
        p_receipt_id: document.getElementById("refundReceipt").value || null,
        p_amount: Number(document.getElementById("refundAmount").value),
        p_status: document.getElementById("refundStatus").value,
        p_reason: document.getElementById("refundReason").value.trim(),
        p_refunded_on: document.getElementById("refundDate").value,
        p_idempotency_key: key
      });
      if (res.error) throw res.error;
      statusEl.textContent = "Refund recorded. Receipt balances were not changed.";
      await load();
    } catch (err) {
      error.textContent = String((err && err.message) || "Unable to save that refund.");
    } finally {
      saving = false;
    }
  });

  async function start() {
    if (window.ReceiptlyAccount && ReceiptlyAccount.ready) await ReceiptlyAccount.ready;
    var today = new Date().toISOString().slice(0, 10);
    document.getElementById("paymentDate").value = today;
    document.getElementById("refundDate").value = today;
    await load();
  }

  start().catch(function () { statusEl.textContent = "Unable to load accounting records."; });
})();
