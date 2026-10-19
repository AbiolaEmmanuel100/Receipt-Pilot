(function () {
  "use strict";

  var KEY = "receiptly_guest_expenses";
  var form = document.getElementById("expenseForm");
  var error = document.getElementById("expenseError");
  var status = document.getElementById("expenseStatus");
  var empty = document.getElementById("expenseEmpty");
  var wrap = document.getElementById("expenseTableWrap");
  var rows = document.getElementById("expenseRows");
  var submitBtn = form ? form.querySelector("button[type=submit]") : null;
  var items = [];
  var editingId = null;
  var saving = false;
  var mode = "loading";

  function money(value) {
    return "₦" + Number(value).toFixed(2);
  }

  function text(value) {
    return document.createTextNode(value || "");
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
      date: row.expense_date,
      description: row.description,
      category: row.category,
      amount: Number(row.amount),
      method: row.payment_method,
      notes: row.notes || ""
    };
  }

  function payload(item) {
    return {
      expense_date: item.date,
      category: item.category,
      description: item.description,
      amount: item.amount,
      payment_method: item.method,
      notes: item.notes || ""
    };
  }

  function render() {
    rows.textContent = "";
    empty.hidden = items.length > 0;
    wrap.hidden = items.length === 0;
    items.forEach(function (item) {
      var tr = document.createElement("tr");
      [item.date, item.description, item.category, money(item.amount), item.method, item.notes || "—"].forEach(function (value, index) {
        var td = document.createElement("td");
        if (index === 3) td.className = "col-num";
        td.appendChild(text(value));
        tr.appendChild(td);
      });
      var actions = document.createElement("td");
      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn btn-ghost btn-sm";
      edit.textContent = "Edit";
      edit.addEventListener("click", function () { startEdit(item); });
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-ghost btn-sm";
      remove.textContent = "Delete";
      remove.addEventListener("click", function () { removeItem(item); });
      actions.appendChild(edit);
      actions.appendChild(document.createTextNode(" "));
      actions.appendChild(remove);
      tr.appendChild(actions);
      rows.appendChild(tr);
    });
  }

  function readForm() {
    var amount = Number(document.getElementById("expenseAmount").value);
    var item = {
      date: document.getElementById("expenseDate").value,
      category: document.getElementById("expenseCategory").value,
      description: document.getElementById("expenseDescription").value.trim(),
      amount: amount,
      method: document.getElementById("expenseMethod").value,
      notes: document.getElementById("expenseNotes").value.trim()
    };
    if (!item.date || !item.description || !item.category || !Number.isFinite(item.amount) || item.amount <= 0) {
      return null;
    }
    return item;
  }

  function resetForm() {
    form.reset();
    editingId = null;
    if (submitBtn) submitBtn.textContent = "Add expense";
  }

  function startEdit(item) {
    editingId = item.id;
    document.getElementById("expenseDate").value = item.date || "";
    document.getElementById("expenseCategory").value = item.category || "";
    document.getElementById("expenseDescription").value = item.description || "";
    document.getElementById("expenseAmount").value = item.amount;
    document.getElementById("expenseMethod").value = item.method || "Cash";
    document.getElementById("expenseNotes").value = item.notes || "";
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
      var res = await sb.from("expenses").select("*").order("expense_date", { ascending: false });
      if (res.error) throw res.error;
      items = (res.data || []).map(mapCloud);
      mode = "cloud";
      setStatus("Saved to your Receipt Pilot account. These expenses are loaded from the cloud.");
      return;
    }
    items = loadGuest();
    mode = "device";
    setStatus("Sign in to save expenses to your account. This list is saved on this device only and is not synchronized.");
  }

  async function saveItem(item) {
    if (mode === "cloud") {
      var sb = await cloud();
      if (!sb) throw new Error("cloud_unavailable");
      var res = editingId
        ? await sb.from("expenses").update(payload(item)).eq("id", editingId).select().single()
        : await sb.from("expenses").insert(payload(item)).select().single();
      if (res.error) throw res.error;
      return;
    }
    if (editingId) {
      items = items.map(function (row) {
        return row.id === editingId ? Object.assign({}, row, item, { id: editingId }) : row;
      });
    } else {
      item.id = "guest-" + Date.now();
      items.unshift(item);
    }
    saveGuest();
  }

  async function removeItem(item) {
    if (!window.confirm("Delete this expense?")) return;
    setError("");
    if (mode === "cloud") {
      var sb = await cloud();
      if (!sb) {
        setError("Unable to reach Receipt Pilot cloud right now.");
        return;
      }
      var res = await sb.from("expenses").delete().eq("id", item.id);
      if (res.error) {
        setError(ReceiptlyCloud.friendlyError ? ReceiptlyCloud.friendlyError(res.error) : "Unable to delete that expense.");
        return;
      }
      await load();
    } else {
      items = items.filter(function (row) { return row.id !== item.id; });
      saveGuest();
    }
    render();
    setStatus(mode === "cloud"
      ? "Expense deleted from your account."
      : "Expense deleted from this device. It was not synchronized.");
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (saving) return;
    var item = readForm();
    if (!item) {
      setError("Enter a date, description, category, and an amount greater than zero.");
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
        ? "Expense saved to your account."
        : "Expense saved on this device only. Sign in to synchronize it.");
    } catch (err) {
      setError(window.ReceiptlyCloud && ReceiptlyCloud.friendlyError
        ? ReceiptlyCloud.friendlyError(err)
        : "Unable to save that expense.");
    } finally {
      saving = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  async function start() {
    try {
      if (window.ReceiptlyAccount && ReceiptlyAccount.ready) await ReceiptlyAccount.ready;
      await load();
    } catch (err) {
      items = [];
      mode = "error";
      setStatus("Unable to load expenses.");
      setError(window.ReceiptlyCloud && ReceiptlyCloud.friendlyError
        ? ReceiptlyCloud.friendlyError(err)
        : "Unable to load expenses.");
    }
    render();
  }

  start();
})();
