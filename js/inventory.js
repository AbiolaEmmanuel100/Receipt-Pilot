(function () {
  "use strict";

  var KEY = "receiptly_guest_products";
  var form = document.getElementById("productForm");
  var error = document.getElementById("productError");
  var status = document.getElementById("productStatus");
  var empty = document.getElementById("productEmpty");
  var wrap = document.getElementById("productTableWrap");
  var rows = document.getElementById("productRows");
  var archivedToggle = document.getElementById("showArchived");
  var submitBtn = form ? form.querySelector("button[type=submit]") : null;
  var items = [];
  var editingId = null;
  var saving = false;
  var mode = "loading";

  function money(value) {
    return "₦" + Number(value).toFixed(2);
  }

  function text(value) {
    return document.createTextNode(value == null ? "" : String(value));
  }

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function setError(message) {
    if (error) error.textContent = message || "";
  }

  function userId() {
    return window.ReceiptlyAccount && ReceiptlyAccount.userId ? ReceiptlyAccount.userId() : "";
  }

  function loadGuest() {
    try {
      var raw = localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveGuest() {
    localStorage.setItem(KEY, JSON.stringify(items));
  }

  function mapCloud(row) {
    return {
      id: row.id,
      name: row.name,
      sku: row.sku || "",
      price: Number(row.selling_price),
      cost: row.unit_cost == null ? null : Number(row.unit_cost),
      stock: Number(row.stock_qty),
      threshold: Number(row.low_stock_threshold),
      archived: !!row.archived_at
    };
  }

  function payload(item) {
    return {
      name: item.name,
      sku: item.sku || null,
      selling_price: item.price,
      unit_cost: item.cost,
      stock_qty: item.stock,
      low_stock_threshold: item.threshold
    };
  }

  function visibleItems() {
    var showArchived = archivedToggle && archivedToggle.checked;
    return items.filter(function (item) {
      return showArchived ? item.archived : !item.archived;
    });
  }

  function render() {
    var list = visibleItems();
    rows.textContent = "";
    empty.hidden = list.length > 0;
    wrap.hidden = list.length === 0;
    list.forEach(function (item) {
      var tr = document.createElement("tr");
      var values = [
        item.name,
        item.sku || "—",
        money(item.price),
        item.cost === null ? "Unknown" : money(item.cost),
        String(item.stock),
        String(item.threshold),
        item.archived ? "Archived" : "Active",
        !item.archived && item.stock <= item.threshold ? "Low stock" : "—"
      ];
      values.forEach(function (value, index) {
        var td = document.createElement("td");
        if (index >= 2 && index <= 5) td.className = "col-num";
        td.appendChild(text(value));
        tr.appendChild(td);
      });
      var actions = document.createElement("td");
      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn btn-ghost btn-sm";
      edit.textContent = "Edit";
      edit.addEventListener("click", function () { startEdit(item); });
      var archive = document.createElement("button");
      archive.type = "button";
      archive.className = "btn btn-ghost btn-sm";
      archive.textContent = item.archived ? "Restore" : "Archive";
      archive.addEventListener("click", function () { toggleArchive(item); });
      actions.appendChild(edit);
      actions.appendChild(document.createTextNode(" "));
      actions.appendChild(archive);
      tr.appendChild(actions);
      rows.appendChild(tr);
    });
  }

  function whole(value, raw) {
    return raw !== "" && Number.isFinite(value) && value >= 0 && Math.floor(value) === value;
  }

  function readForm() {
    var name = document.getElementById("productName").value.trim();
    var sku = document.getElementById("productSku").value.trim();
    var price = Number(document.getElementById("productPrice").value);
    var costRaw = document.getElementById("productCost").value.trim();
    var cost = costRaw === "" ? null : Number(costRaw);
    var stockRaw = document.getElementById("productOpening").value.trim();
    var thresholdRaw = document.getElementById("productReorder").value.trim();
    var stock = Number(stockRaw);
    var threshold = Number(thresholdRaw);
    if (!name || !Number.isFinite(price) || price < 0 || !whole(stock, stockRaw) || !whole(threshold, thresholdRaw) ||
      (cost !== null && (!Number.isFinite(cost) || cost < 0))) {
      return null;
    }
    return { name: name, sku: sku, price: price, cost: cost, stock: stock, threshold: threshold, archived: false };
  }

  function duplicateSku(item) {
    if (!item.sku) return false;
    return items.some(function (row) {
      return row.id !== editingId && !row.archived && row.sku && row.sku.toLowerCase() === item.sku.toLowerCase();
    });
  }

  function resetForm() {
    form.reset();
    editingId = null;
    if (submitBtn) submitBtn.textContent = "Add product";
  }

  function startEdit(item) {
    editingId = item.id;
    document.getElementById("productName").value = item.name || "";
    document.getElementById("productSku").value = item.sku || "";
    document.getElementById("productPrice").value = item.price;
    document.getElementById("productCost").value = item.cost == null ? "" : item.cost;
    document.getElementById("productOpening").value = item.stock;
    document.getElementById("productReorder").value = item.threshold;
    if (submitBtn) submitBtn.textContent = "Save changes";
    setError("");
  }

  async function cloud() {
    if (!window.ReceiptlyCloud || !ReceiptlyCloud.ready) return null;
    return ReceiptlyCloud.ready();
  }

  async function load() {
    if (userId()) {
      var sb = await cloud();
      if (!sb) throw new Error("cloud_unavailable");
      var res = await sb.from("products").select("*").order("name");
      if (res.error) throw res.error;
      items = (res.data || []).map(mapCloud);
      mode = "cloud";
      setStatus("Saved to your Receipt Pilot account. Active products are shown by default.");
      return;
    }
    items = loadGuest();
    mode = "device";
    setStatus("Sign in to save products to your account. This list is saved on this device only and is not synchronized.");
  }

  async function saveItem(item) {
    if (mode === "cloud") {
      var sb = await cloud();
      if (!sb) throw new Error("cloud_unavailable");
      var res = editingId
        ? await sb.from("products").update(payload(item)).eq("id", editingId).select().single()
        : await sb.from("products").insert(payload(item)).select().single();
      if (res.error) throw res.error;
      return;
    }
    if (editingId) {
      items = items.map(function (row) {
        return row.id === editingId ? Object.assign({}, row, item, { id: editingId, archived: row.archived }) : row;
      });
    } else {
      item.id = "guest-" + Date.now();
      items.push(item);
    }
    saveGuest();
  }

  async function toggleArchive(item) {
    var next = !item.archived;
    if (!window.confirm(next ? "Archive this product?" : "Restore this product?")) return;
    if (mode === "cloud") {
      var sb = await cloud();
      if (!sb) {
        setError("Unable to reach Receipt Pilot cloud right now.");
        return;
      }
      var res = await sb.from("products").update({ archived_at: next ? new Date().toISOString() : null }).eq("id", item.id);
      if (res.error) {
        setError(ReceiptlyCloud.friendlyError ? ReceiptlyCloud.friendlyError(res.error) : "Unable to update that product.");
        return;
      }
      await load();
    } else {
      items = items.map(function (row) {
        return row.id === item.id ? Object.assign({}, row, { archived: next }) : row;
      });
      saveGuest();
    }
    render();
    setStatus(mode === "cloud"
      ? (next ? "Product archived in your account." : "Product restored in your account.")
      : "Product updated on this device only.");
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (saving) return;
    var item = readForm();
    if (!item) {
      setError("Enter a product name, a non-negative price, and whole-number stock values. Leave cost blank if unknown.");
      return;
    }
    if (duplicateSku(item)) {
      setError("That SKU is already used by another active product.");
      return;
    }
    saving = true;
    if (submitBtn) submitBtn.disabled = true;
    setError("");
    try {
      await saveItem(item);
      resetForm();
      await load();
      render();
      setStatus(mode === "cloud"
        ? "Product saved to your account."
        : "Product saved on this device only. Sign in to synchronize it.");
    } catch (err) {
      var message = String((err && err.message) || "");
      if (/products_user_sku_uidx|duplicate key/i.test(message)) {
        setError("That SKU is already used by another product in your account.");
      } else {
        setError(window.ReceiptlyCloud && ReceiptlyCloud.friendlyError
          ? ReceiptlyCloud.friendlyError(err)
          : "Unable to save that product.");
      }
    } finally {
      saving = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  if (archivedToggle) archivedToggle.addEventListener("change", render);

  async function start() {
    try {
      if (window.ReceiptlyAccount && ReceiptlyAccount.ready) await ReceiptlyAccount.ready;
      await load();
    } catch (err) {
      items = [];
      mode = "error";
      setStatus("Unable to load products.");
      setError(window.ReceiptlyCloud && ReceiptlyCloud.friendlyError
        ? ReceiptlyCloud.friendlyError(err)
        : "Unable to load products.");
    }
    render();
  }

  start();
})();
