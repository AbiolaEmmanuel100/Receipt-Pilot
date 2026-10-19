(function () {
  "use strict";

  var statusEl = document.getElementById("supplierStatus");
  var rows = document.getElementById("supplierRows");
  var supplierSelect = document.getElementById("purchaseSupplier");
  var productSelect = document.getElementById("purchaseProduct");
  var saving = false;

  function text(value) {
    return document.createTextNode(value || "");
  }

  function userId() {
    return window.ReceiptlyAccount && ReceiptlyAccount.userId ? ReceiptlyAccount.userId() : "";
  }

  async function cloud() {
    return window.ReceiptlyCloud && ReceiptlyCloud.ready ? ReceiptlyCloud.ready() : null;
  }

  async function load() {
    if (!userId()) {
      statusEl.textContent = "Sign in to save suppliers to your account.";
      return;
    }
    var sb = await cloud();
    if (!sb) {
      statusEl.textContent = "Unable to reach Receipt Pilot cloud right now.";
      return;
    }
    var suppliers = await sb.from("suppliers").select("*").order("name");
    var products = await sb.from("products").select("id,name,archived_at").order("name");
    if (suppliers.error) throw suppliers.error;
    rows.textContent = "";
    supplierSelect.textContent = "";
    (suppliers.data || []).forEach(function (row) {
      var tr = document.createElement("tr");
      [row.name, row.phone || "—", row.notes || "—"].forEach(function (value) {
        var td = document.createElement("td");
        td.appendChild(text(value));
        tr.appendChild(td);
      });
      rows.appendChild(tr);
      var option = document.createElement("option");
      option.value = row.id;
      option.textContent = row.name;
      supplierSelect.appendChild(option);
    });
    productSelect.textContent = "";
    (products.data || []).filter(function (row) { return !row.archived_at; }).forEach(function (row) {
      var option = document.createElement("option");
      option.value = row.id;
      option.textContent = row.name;
      productSelect.appendChild(option);
    });
    statusEl.textContent = "Loaded from your account. Stock purchases are not operating expenses.";
  }

  document.getElementById("supplierForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (saving) return;
    saving = true;
    var error = document.getElementById("supplierError");
    error.textContent = "";
    try {
      var sb = await cloud();
      var res = await sb.from("suppliers").insert({
        name: document.getElementById("supplierName").value.trim(),
        phone: document.getElementById("supplierPhone").value.trim(),
        notes: document.getElementById("supplierNotes").value.trim()
      });
      if (res.error) throw res.error;
      event.target.reset();
      await load();
    } catch (err) {
      error.textContent = "Unable to save that supplier.";
    } finally {
      saving = false;
    }
  });

  document.getElementById("purchaseForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (saving) return;
    saving = true;
    var error = document.getElementById("purchaseError");
    error.textContent = "";
    try {
      var sb = await cloud();
      var key = "purchase-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      var qty = Number(document.getElementById("purchaseQty").value);
      var cost = Number(document.getElementById("purchaseCost").value);
      var productId = document.getElementById("purchaseProduct").value;
      var purchase = await sb.from("stock_purchases").insert({
        supplier_id: document.getElementById("purchaseSupplier").value || null,
        product_id: productId,
        quantity: qty,
        unit_cost: cost,
        purchased_on: document.getElementById("purchaseDate").value,
        notes: document.getElementById("purchaseNotes").value.trim(),
        idempotency_key: key
      });
      if (purchase.error) throw purchase.error;
      var movement = await sb.rpc("record_stock_movement", {
        p_product_id: productId,
        p_type: "purchase",
        p_quantity: qty,
        p_unit_cost: cost,
        p_note: "Stock purchase",
        p_idempotency_key: key
      });
      if (movement.error) throw movement.error;
      statusEl.textContent = "Stock purchase saved and inventory updated.";
      event.target.reset();
    } catch (err) {
      error.textContent = "Unable to save that stock purchase.";
    } finally {
      saving = false;
    }
  });

  async function start() {
    if (window.ReceiptlyAccount && ReceiptlyAccount.ready) await ReceiptlyAccount.ready;
    document.getElementById("purchaseDate").value = new Date().toISOString().slice(0, 10);
    await load();
  }

  start().catch(function () { statusEl.textContent = "Unable to load suppliers."; });
})();
