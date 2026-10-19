(function () {
  "use strict";

  var statusEl = document.getElementById("acctStatus");
  var warningsEl = document.getElementById("acctWarnings");
  var cards = document.getElementById("summaryCards");
  var detailTitle = document.getElementById("detailTitle");
  var detailHead = document.getElementById("detailHead");
  var detailRows = document.getElementById("detailRows");
  var data = { receipts: [], payments: [], refunds: [], expenses: [], purchases: [], products: [] };

  function money(value) {
    return "₦" + Number(value || 0).toFixed(2);
  }

  function text(value) {
    return document.createTextNode(value == null ? "" : String(value));
  }

  function iso(date) {
    return date.toISOString().slice(0, 10);
  }

  function range() {
    var preset = document.getElementById("periodPreset").value;
    var now = new Date();
    var from = new Date(now);
    var to = new Date(now);
    if (preset === "yesterday") {
      from.setDate(now.getDate() - 1);
      to = new Date(from);
    } else if (preset === "week") {
      from.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    } else if (preset === "last-week") {
      from.setDate(now.getDate() - ((now.getDay() + 6) % 7) - 7);
      to = new Date(from);
      to.setDate(from.getDate() + 6);
    } else if (preset === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === "last-month") {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (preset === "custom") {
      return { from: document.getElementById("fromDate").value, to: document.getElementById("toDate").value };
    }
    return { from: iso(from), to: iso(to) };
  }

  function inRange(date, bounds) {
    return !!(date && bounds.from && bounds.to && date >= bounds.from && date <= bounds.to);
  }

  function showTable(title, headers, rows) {
    detailTitle.textContent = title;
    detailHead.textContent = "";
    detailRows.textContent = "";
    var tr = document.createElement("tr");
    headers.forEach(function (header) {
      var th = document.createElement("th");
      th.textContent = header;
      tr.appendChild(th);
    });
    detailHead.appendChild(tr);
    rows.forEach(function (row) {
      var body = document.createElement("tr");
      row.forEach(function (value) {
        var td = document.createElement("td");
        td.appendChild(text(value));
        body.appendChild(td);
      });
      detailRows.appendChild(body);
    });
  }

  function card(label, value, onClick) {
    var div = document.createElement("div");
    div.className = "acct-card";
    var button = document.createElement("button");
    button.type = "button";
    button.appendChild(text(label));
    var strong = document.createElement("strong");
    strong.textContent = value;
    button.appendChild(strong);
    button.addEventListener("click", onClick);
    div.appendChild(button);
    return div;
  }

  async function load() {
    if (!window.ReceiptlyAccount || !ReceiptlyAccount.userId || !ReceiptlyAccount.userId()) {
      statusEl.textContent = "Sign in to load accounting records from your account.";
      return;
    }
    var sb = await ReceiptlyCloud.ready();
    if (!sb) {
      statusEl.textContent = "Unable to reach Receipt Pilot cloud right now.";
      return;
    }
    var bounds = range();
    var receiptsRes = await sb.from("receipts").select("id,receipt_number,customer_name,total,amount_paid,outstanding,payment_status,receipt_date,deleted_at").is("deleted_at", null);
    if (receiptsRes.error) throw receiptsRes.error;
    var paymentsRes = await sb.from("customer_payments").select("id,receipt_id,amount,paid_on,payment_method,reference");
    var refundsRes = await sb.from("refunds").select("id,amount,status,refunded_on,reason");
    var expensesRes = await sb.from("expenses").select("id,expense_date,category,description,amount");
    var purchasesRes = await sb.from("stock_purchases").select("id,purchased_on,quantity,unit_cost,product_id");
    var productsRes = await sb.from("products").select("id,name,stock_qty,unit_cost,low_stock_threshold,archived_at");

    data.receipts = (receiptsRes.data || []).filter(function (row) { return inRange(row.receipt_date, bounds); });
    data.payments = paymentsRes.error ? null : (paymentsRes.data || []).filter(function (row) { return inRange(row.paid_on, bounds); });
    data.refunds = refundsRes.error ? null : (refundsRes.data || []).filter(function (row) { return inRange(row.refunded_on, bounds); });
    data.expenses = expensesRes.error ? null : (expensesRes.data || []).filter(function (row) { return inRange(row.expense_date, bounds); });
    data.purchases = purchasesRes.error ? null : (purchasesRes.data || []).filter(function (row) { return inRange(row.purchased_on, bounds); });
    data.products = productsRes.error ? null : (productsRes.data || []);

    var sales = data.receipts.reduce(function (sum, row) { return sum + Number(row.total || 0); }, 0);
    var collected = data.payments ? data.payments.reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0) : null;
    var completedRefunds = data.refunds ? data.refunds.filter(function (row) { return row.status === "completed"; }).reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0) : null;
    var expenses = data.expenses ? data.expenses.reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0) : null;
    var purchases = data.purchases ? data.purchases.reduce(function (sum, row) { return sum + Number(row.quantity || 0) * Number(row.unit_cost || 0); }, 0) : null;
    var lowStock = data.products ? data.products.filter(function (row) { return !row.archived_at && Number(row.stock_qty) <= Number(row.low_stock_threshold); }) : null;

    cards.textContent = "";
    cards.appendChild(card("Sales recorded", money(sales), function () {
      showTable("Sales in period", ["Receipt", "Customer", "Date", "Total", "Status"], data.receipts.map(function (row) {
        return [row.receipt_number, row.customer_name || "—", row.receipt_date, money(row.total), row.payment_status];
      }));
    }));
    cards.appendChild(card("Cash collected", collected == null ? "Unavailable" : money(collected), function () {
      if (!data.payments) return showTable("Cash collected", ["Message"], [["Dated payment records need migration 012."]]);
      showTable("Dated payments in period", ["Date", "Method", "Reference", "Amount"], data.payments.map(function (row) {
        return [row.paid_on, row.payment_method, row.reference || "—", money(row.amount)];
      }));
    }));
    cards.appendChild(card("Completed refunds", completedRefunds == null ? "Unavailable" : money(completedRefunds), function () {
      if (!data.refunds) return showTable("Refunds", ["Message"], [["Refund records need migration 012."]]);
      showTable("Completed refunds", ["Date", "Reason", "Amount"], data.refunds.filter(function (row) { return row.status === "completed"; }).map(function (row) {
        return [row.refunded_on, row.reason || "—", money(row.amount)];
      }));
    }));
    cards.appendChild(card("Operating expenses", expenses == null ? "Unavailable" : money(expenses), function () {
      if (!data.expenses) return showTable("Expenses", ["Message"], [["Expense records could not be loaded."]]);
      showTable("Expenses in period", ["Date", "Category", "Description", "Amount"], data.expenses.map(function (row) {
        return [row.expense_date, row.category, row.description, money(row.amount)];
      }));
    }));
    cards.appendChild(card("Supplier purchases", purchases == null ? "Unavailable" : money(purchases), function () {
      if (!data.purchases) return showTable("Purchases", ["Message"], [["Purchase records need migration 012."]]);
      showTable("Stock purchases in period", ["Date", "Quantity", "Unit cost", "Total"], data.purchases.map(function (row) {
        return [row.purchased_on, row.quantity, money(row.unit_cost), money(Number(row.quantity) * Number(row.unit_cost))];
      }));
    }));
    cards.appendChild(card("Low stock", lowStock == null ? "Unavailable" : String(lowStock.length), function () {
      if (!data.products) return showTable("Low stock", ["Message"], [["Products could not be loaded."]]);
      showTable("Low-stock products", ["Product", "Stock", "Threshold"], lowStock.map(function (row) {
        return [row.name, row.stock_qty, row.low_stock_threshold];
      }));
    }));
    cards.appendChild(card("Gross profit", "Unavailable", function () {
      showTable("Gross profit", ["Explanation"], [["Historic receipt lines are not linked to product costs, so profit is not calculated."]]);
    }));

    warningsEl.textContent = "Sales use receipt dates. Cash collected uses dated payment records only. Outstanding balances are not shown as a historical figure because existing receipts do not store a dated balance history. Stock purchases are not operating expenses.";
    statusEl.textContent = "Loaded from your account for " + bounds.from + " to " + bounds.to + ".";
    showTable("Sales in period", ["Receipt", "Customer", "Date", "Total", "Status"], data.receipts.map(function (row) {
      return [row.receipt_number, row.customer_name || "—", row.receipt_date, money(row.total), row.payment_status];
    }));
  }

  document.getElementById("periodForm").addEventListener("submit", function (event) {
    event.preventDefault();
    load().catch(function () { statusEl.textContent = "Unable to load accounting records."; });
  });

  async function start() {
    if (window.ReceiptlyAccount && ReceiptlyAccount.ready) await ReceiptlyAccount.ready;
    await load();
  }

  start().catch(function () { statusEl.textContent = "Unable to load accounting records."; });
})();
