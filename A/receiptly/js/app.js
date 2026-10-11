(function () {
  "use strict";

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.from((root || document).querySelectorAll(sel)); };

  var editingId = null;
  var lastSavedId = null;
  var styleName = "classic";
  var logoData = "";
  var saving = false;
  var FORM_DRAFT = "receiptly_open_form_v1";
  var draftTimer = null;
  var authGen = 0;

  function formDraftKey() {
    var uid = window.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId();
    return FORM_DRAFT + ":" + (uid || "guest");
  }

  function phoneApi() { return window.ReceiptlyPhone || null; }

  function readPhone(id) {
    var el = $(id);
    if (!el) return { phone: "", country: "", national: "" };
    var api = phoneApi();
    if (api && api.getValue) {
      var info = api.getValue(el);
      return {
        phone: info.valid ? info.e164 : String(el.value || ""),
        country: info.iso || "",
        national: info.nationalDigits || String(el.value || "")
      };
    }
    return { phone: el.value || "", country: "", national: el.value || "" };
  }

  function writePhone(id, raw, iso) {
    var el = $(id);
    if (!el) return;
    var api = phoneApi();
    if (api && api.setValue) api.setValue(el, raw || "", iso || "");
    else el.value = raw || "";
  }

  function clearPhone(id, keepCountry) {
    var el = $(id);
    if (!el) return;
    var api = phoneApi();
    if (api && api.clearValue) api.clearValue(el, !!keepCountry);
    else el.value = "";
  }

  function customerDefaultIso() {
    var biz = readPhone("#bizPhone");
    if (biz.country) return biz.country;
    var api = phoneApi();
    if (api && api.suggestedIso) return api.suggestedIso($("#currency") && $("#currency").value);
    return "";
  }

  function mountPhones() {
    var api = phoneApi();
    if (!api || !api.mount) return;
    ["#bizPhone", "#custPhone"].forEach(function (sel) {
      var el = $(sel);
      if (el) api.mount(el);
    });
  }

  function defaultItem() {
    return { name: "", qty: 1, price: 0 };
  }

  function readForm() {
    var items = $$("#itemsList .item-row").map(function (row) {
      return {
        name: $("[data-k=name]", row).value,
        qty: $("[data-k=qty]", row).value,
        price: $("[data-k=price]", row).value
      };
    });
    if (!items.length) items = [defaultItem()];
    var calc = ReceiptlyCalc.compute(
      items,
      $("#discount").value,
      $("#taxPct").value,
      $("#amountPaid").value,
      $("#shipping") ? $("#shipping").value : 0
    );
    return {
      number: $("#receiptNo").value.trim(),
      date: $("#receiptDate").value,
      time: $("#receiptTime").value,
      payment: $("#paymentMethod").value,
      currency: $("#currency").value,
      notes: $("#notes").value,
      template: styleName,
      business: (function () {
        var bp = readPhone("#bizPhone");
        return {
        name: $("#bizName").value,
        address: $("#bizAddress").value,
        phone: bp.phone,
        phoneCountry: bp.country,
        email: $("#bizEmail").value,
        website: $("#bizWebsite").value,
        logo: logoData,
        footer: ($("#bizFooter") && $("#bizFooter").value) || ""
        };
      })(),
      customer: (function () {
        var cp = readPhone("#custPhone");
        return {
        name: $("#custName").value,
        phone: cp.phone,
        phoneCountry: cp.country,
        email: $("#custEmail").value
        };
      })(),
      items: calc.items,
      subtotal: calc.subtotal,
      discount: calc.discount,
      taxPct: calc.taxPct,
      tax: calc.tax,
      shipping: calc.shipping,
      grand: calc.grand,
      paid: calc.paid,
      balance: calc.balance,
      status: ($("#paymentStatus") && $("#paymentStatus").value) || "UNPAID",
      timezone: ReceiptlyVal.timeZone ? ReceiptlyVal.timeZone() : ""
    };
  }

  function applyPaymentRules() {
    var statusEl = $("#paymentStatus");
    var paidEl = $("#amountPaid");
    if (!statusEl || !paidEl) return;
    var status = statusEl.value || "UNPAID";
    var items = $$("#itemsList .item-row").map(function (row) {
      return {
        name: $("[data-k=name]", row).value,
        qty: $("[data-k=qty]", row).value,
        price: $("[data-k=price]", row).value
      };
    });
    var calc = ReceiptlyCalc.compute(items, $("#discount").value, $("#taxPct").value, 0, $("#shipping") ? $("#shipping").value : 0);
    if (status === "PAID IN FULL" || status === "PAID") {
      paidEl.value = calc.grand;
      paidEl.readOnly = true;
      paidEl.classList.add("is-locked");
    } else if (status === "UNPAID") {
      paidEl.value = 0;
      paidEl.readOnly = true;
      paidEl.classList.add("is-locked");
    } else {
      paidEl.readOnly = false;
      paidEl.classList.remove("is-locked");
    }
  }

  function updateItemTotals() {
    applyPaymentRules();
    var data = readForm();
    data.items.forEach(function (it, i) {
      var el = $('[data-total="' + i + '"]');
      if (el) el.textContent = ReceiptlyCalc.money(it.total, data.currency);
    });
    var hint = statusMessage(data);
    var hintEl = $("#statusHint");
    if (hintEl) hintEl.textContent = hint;
    var bal = $("#balanceDue");
    if (bal) bal.value = ReceiptlyCalc.money(data.balance, data.currency);
    ReceiptlyReceipt.render(data, $("#receiptPreview"));
  }

  function statusMessage(data) {
    var st = data.status;
    var paid = data.paid;
    var grand = data.grand;
    if (st === "PARTIALLY PAID") {
      if (!(paid > 0)) return "Enter an amount greater than 0 for a partially paid receipt.";
      if (paid + 0.0001 >= grand) return "For a partially paid receipt, Amount Paid must be less than the Grand Total.";
    }
    return "";
  }

  function renderItems(items) {
    var wrap = $("#itemsList");
    wrap.innerHTML = "";
    (items && items.length ? items : [defaultItem()]).forEach(function (it, i) {
      var row = document.createElement("div");
      row.className = "item-row";
      row.innerHTML =
        '<div class="field span-full"><label>Item / Service</label>' +
        '<input type="text" data-k="name" value="' + ReceiptlyVal.sanitize(it.name || "") + '"></div>' +
        '<div class="field"><label>Qty</label>' +
        '<input type="number" min="0" step="1" data-k="qty" value="' + ReceiptlyVal.sanitize(it.qty == null ? 1 : it.qty) + '"></div>' +
        '<div class="field"><label>Unit Price</label>' +
        '<input type="number" min="0" step="0.01" data-k="price" value="' + ReceiptlyVal.sanitize(it.price == null ? 0 : it.price) + '"></div>' +
        '<div class="field"><span class="hint">Total</span><div class="item-total" data-total="' + i + '">—</div></div>' +
        '<div class="field"><button type="button" class="btn btn-danger btn-sm" data-del>Delete</button></div>';
      wrap.appendChild(row);
    });
    updateItemTotals();
  }

  function setStyle(name) {
    styleName = name;
    var label = $("#currentTemplateLabel");
    if (label) label.textContent = name.replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    updateItemTotals();
  }

  function fillBusiness(biz) {
    if (!biz) return;
    $("#bizName").value = biz.name || "";
    $("#bizAddress").value = biz.address || "";
    writePhone("#bizPhone", biz.phone || "", biz.phoneCountry || "");
    if (!biz.phone && !biz.phoneCountry && window.ReceiptlyPhone && ReceiptlyPhone.suggestedIso) {
      var suggested = ReceiptlyPhone.suggestedIso(biz.currency || ($("#currency") && $("#currency").value));
      var bizEl = $("#bizPhone");
      if (suggested && bizEl && ReceiptlyPhone.widgetFor) {
        var w = ReceiptlyPhone.widgetFor(bizEl);
        if (w && !w.getIso()) w.setIso(suggested);
      }
    }
    $("#bizEmail").value = biz.email || "";
    $("#bizWebsite").value = biz.website || "";
    $("#prefix").value = biz.prefix || "RCT-";
    if ($("#bizFooter")) $("#bizFooter").value = biz.footer || "";
    if ($("#taxDefault")) $("#taxDefault").value = biz.taxPct || "";
    logoData = biz.logo || "";
    if (biz.currency && $("#currency")) $("#currency").value = biz.currency;
    if (biz.template) setStyle(biz.template);
    if (biz.taxPct != null && $("#taxPct") && !$("#taxPct").value) $("#taxPct").value = biz.taxPct;
    if (biz.name) collapseBiz(true);
  }

  function collapseBiz(collapsed) {
    var fields = $("#bizFields");
    var bar = $("#bizBar");
    var caret = $("#bizToggle");
    if (!fields || !bar) return;
    bar.hidden = false;
    fields.hidden = !!collapsed;
    if (caret) caret.setAttribute("aria-expanded", String(!collapsed));
    var saveBiz = $("#saveBiz");
    if (saveBiz) saveBiz.hidden = !!collapsed;
  }

  function openTemplates() {
    var grid = $("#templateGrid");
    var dlg = $("#templateDialog");
    if (!grid || !dlg || !window.ReceiptlyTemplates) return;
    grid.innerHTML = ReceiptlyTemplates.list.map(function (t) {
      return '<button type="button" class="template-card" data-pick="' + t.id + '" aria-pressed="' + (t.id === styleName) + '"><strong>' + t.name + "</strong></button>";
    }).join("");
    dlg.hidden = false;
    grid.onclick = function (e) {
      var btn = e.target.closest("[data-pick]");
      if (!btn) return;
      setStyle(btn.dataset.pick);
      dlg.hidden = true;
      ReceiptlyStorage.getBusiness().then(function (biz) {
        biz = biz || {};
        biz.template = btn.dataset.pick;
        return ReceiptlyStorage.saveBusiness(biz);
      }).then(function () {
        if (window.ReceiptlySync && ReceiptlySync.pushBusiness) return ReceiptlySync.pushBusiness();
      });
    };
  }

  function fillRecord(rec) {
    fillBusiness(rec.business);
    $("#custName").value = rec.customer && rec.customer.name || "";
    writePhone("#custPhone", rec.customer && rec.customer.phone || "", rec.customer && rec.customer.phoneCountry || "");
    $("#custEmail").value = rec.customer && rec.customer.email || "";
    $("#receiptNo").value = rec.number || "";
    $("#receiptDate").value = rec.date || ReceiptlyVal.today();
    $("#receiptTime").value = rec.time || ReceiptlyVal.nowTime();
    $("#paymentMethod").value = rec.payment || "Cash";
    $("#currency").value = rec.currency || "NGN";
    $("#notes").value = rec.notes || "";
    $("#discount").value = rec.discount || "";
    $("#taxPct").value = rec.taxPct || "";
    if ($("#shipping")) $("#shipping").value = rec.shipping || "";
    $("#amountPaid").value = rec.paid || "";
    if ($("#paymentStatus")) {
      var st = rec.status || "UNPAID";
      if (st === "PAID") st = "PAID IN FULL";
      $("#paymentStatus").value = st;
    }
    logoData = rec.business && rec.business.logo || "";
    setStyle(rec.template || "classic");
    renderItems(rec.items);
    $("#editBanner").hidden = !editingId;
  }

  async function assignNumberIfNeeded() {
    var current = $("#receiptNo").value.trim();
    if (current) return current;
    var biz = await ReceiptlyStorage.getBusiness();
    var prefix = (biz && biz.prefix) || $("#prefix").value || "RCT-";
    var peek = 0;
    if (ReceiptlyStorage.peekNumber) peek = Number(await ReceiptlyStorage.peekNumber()) || 0;
    if (peek === 0 && window.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId() &&
        window.ReceiptlySync && ReceiptlySync.allocateReceiptNumber) {
      try {
        var allocated = await ReceiptlySync.allocateReceiptNumber(prefix);
        if (allocated) {
          $("#receiptNo").value = allocated;
          if (ReceiptlyStorage.catchUpSequence) await ReceiptlyStorage.catchUpSequence([allocated], prefix);
          return allocated;
        }
      } catch (e) { /* local fallback */ }
    }
    var seq = await ReceiptlyStorage.nextNumber();
    var num = ReceiptlyStorage.formatNumber(seq, prefix);
    $("#receiptNo").value = num;
    return num;
  }

  async function saveReceipt() {
    if (saving) return;
    saving = true;
    var saveBtnEarly = $("#saveBtn");
    if (saveBtnEarly) saveBtnEarly.disabled = true;
    try {
      var data = readForm();
      var hasItem = data.items.some(function (it) { return String(it.name || "").trim() && (Number(it.qty) || 0) > 0; });
      if (!hasItem || !(data.grand > 0)) {
        ReceiptlyUI.toast("Please add at least one item before generating the receipt.", "error");
        saving = false;
        if (saveBtnEarly) saveBtnEarly.disabled = false;
        return;
      }
      var mismatch = statusMessage(data);
      if (mismatch) {
        var hintEl = $("#statusHint");
        if (hintEl) hintEl.textContent = mismatch;
        ReceiptlyUI.toast(mismatch, "error");
        saving = false;
        if (saveBtnEarly) saveBtnEarly.disabled = false;
        return;
      }
      if (window.ReceiptlyUsage && !ReceiptlyUsage.canPersist()) {
        ReceiptlyUsage.showGate();
        saving = false;
        if (saveBtnEarly) saveBtnEarly.disabled = false;
        return;
      }
      if (!data.date) data.date = ReceiptlyVal.today();
      if (!data.time) data.time = ReceiptlyVal.nowTime();
      if (!$("#receiptNo").value.trim()) await assignNumberIfNeeded();
      data.number = $("#receiptNo").value.trim();

      var existing = await ReceiptlyStorage.getReceiptByNumber(data.number);
      if (existing && existing.id !== editingId) {
        ReceiptlyUI.toast("Receipt number already exists. Choose another.", "error");
        saving = false;
        if (saveBtnEarly) saveBtnEarly.disabled = false;
        return;
      }

      if (!(data.business && data.business.name) && !editingId) {
        var storedBiz = await ReceiptlyStorage.getBusiness();
        if (storedBiz && (storedBiz.name || storedBiz.address || storedBiz.phone || storedBiz.email)) {
          data.business = {
            name: storedBiz.name || "",
            address: storedBiz.address || "",
            phone: storedBiz.phone || "",
            phoneCountry: storedBiz.phoneCountry || "",
            email: storedBiz.email || "",
            website: storedBiz.website || "",
            logo: storedBiz.logo || "",
            footer: storedBiz.footer || ""
          };
          if (!data.taxPct && storedBiz.taxPct) data.taxPct = storedBiz.taxPct;
        }
      }
      if (!editingId && !existing) {
        var peek = await (ReceiptlyStorage.peekNumber ? ReceiptlyStorage.peekNumber() : ReceiptlyStorage.getMeta("sequence", 0));
        var formatted = ReceiptlyStorage.formatNumber(Number(peek) + 1, $("#prefix").value || "RCT-");
        if (data.number === formatted) await ReceiptlyStorage.nextNumber();
      }

      var now = new Date().toISOString();
      var record;
      var editLockId = editingId || null;
      if (editLockId) {
        var prev = await ReceiptlyStorage.getReceipt(editLockId);
        if (!prev) {
          ReceiptlyUI.toast("That receipt is not available on this account.", "error");
          saving = false;
          if (saveBtnEarly) saveBtnEarly.disabled = false;
          editingId = null;
          if ($("#editBanner")) $("#editBanner").hidden = true;
          return;
        }
        record = Object.assign({}, prev, data, {
          id: editLockId,
          updatedAt: now,
          createdAt: prev && prev.createdAt ? prev.createdAt : now,
          shareToken: (prev && prev.shareToken) || (window.ReceiptlyShare ? ReceiptlyShare.makeToken() : ReceiptlyVal.uid().slice(0, 10)),
          versions: ((prev && prev.versions) || []).concat([{ at: now, action: "edited" }]).slice(-20)
        });
      } else {
        record = Object.assign({}, data, {
          id: ReceiptlyVal.uid(),
          createdAt: now,
          updatedAt: now,
          versions: [{ at: now, action: "created" }],
          shareToken: window.ReceiptlyShare ? ReceiptlyShare.makeToken() : ReceiptlyVal.uid().slice(0, 10)
        });
      }
      if (editLockId) {
        var still = await ReceiptlyStorage.getReceipt(editLockId);
        if (!still) {
          ReceiptlyUI.toast("That receipt is not available on this account.", "error");
          saving = false;
          if (saveBtnEarly) saveBtnEarly.disabled = false;
          editingId = null;
          if ($("#editBanner")) $("#editBanner").hidden = true;
          return;
        }
      }
      if (window.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId()) {
        record.userId = ReceiptlyAccount.userId();
      }
      record.syncStatus = "pending";
      record.isDraft = false;
      var saveBtn = $("#saveBtn");
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.dataset.label = saveBtn.textContent;
        saveBtn.textContent = "Saving…";
      }
      await ReceiptlyStorage.saveReceipt(record);
      if (editLockId) {
        var stillOwned = await ReceiptlyStorage.getReceipt(editLockId);
        if (!stillOwned) {
          saving = false;
          if (saveBtnEarly) saveBtnEarly.disabled = false;
          editingId = null;
          if ($("#editBanner")) $("#editBanner").hidden = true;
          return;
        }
      }
      if (window.ReceiptlyAnalytics) {
        ReceiptlyAnalytics.track("receipt_saved", {
          currency: record.currency,
          template: record.template,
          payment_method: record.payment,
          payment_status: record.status
        });
      }
      lastSavedId = record.id;
      if (window.ReceiptlyActivity) {
        ReceiptlyActivity.log(editingId ? "receipt_edited" : "receipt_created", { number: record.number });
      }
      var synced = false;
      if (window.ReceiptlySync && ReceiptlySync.pushOne) {
        synced = await ReceiptlySync.pushOne(record);
      }
      if (window.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId() && navigator.onLine && !synced) {
        ReceiptlyUI.toast("Saved on this device, but your account could not be updated. Receipt Pilot will retry when the connection is stable.", "error");
      }
      showSaveDialog(record, synced);
      ReceiptlyUI.toast("Receipt saved ✓");
      clearOpenForm();
      var savedBizPhone = readPhone("#bizPhone");
      await ReceiptlyStorage.saveBusiness({
        name: record.business.name,
        address: record.business.address,
        phone: savedBizPhone.phone || record.business.phone,
        phoneCountry: savedBizPhone.country || record.business.phoneCountry || "",
        email: record.business.email,
        website: record.business.website,
        logo: record.business.logo,
        prefix: $("#prefix").value || "RCT-",
        footer: ($("#bizFooter") && $("#bizFooter").value) || record.business.footer || "",
        currency: record.currency,
        template: record.template,
        taxPct: $("#taxDefault") ? $("#taxDefault").value : record.taxPct
      });
      await resetAfterSave(record.currency, record.template);
    } catch (err) {
      if (window.ReceiptlyErrors) ReceiptlyErrors.report((err && err.message) || "save", "save");
      ReceiptlyUI.toast("Unable to save this receipt. It was not stored. Please try again.", "error");
    } finally {
      saving = false;
      var saveBtn2 = $("#saveBtn");
      if (saveBtn2) {
        saveBtn2.disabled = false;
        if (saveBtn2.dataset.label) saveBtn2.textContent = saveBtn2.dataset.label;
      }
    }
  }

  function showSaveDialog(record, synced) {
    var extra = $("#savedExtra");
    var title = $("#saveDialog h2");
    if (title) title.textContent = "Receipt saved ✓";
    if (extra) {
      if (synced) extra.textContent = "Receipt #" + record.number + " is saved in your Receipt Pilot account and Receipt History.";
      else if (window.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId() && !navigator.onLine) {
        extra.textContent = "Receipt #" + record.number + " is saved on this device. It will appear in your account when you are back online.";
      } else if (window.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId()) {
        extra.textContent = "Receipt #" + record.number + " is on this device, but your account did not update. Receipt Pilot will retry. It is not confirmed in the cloud yet.";
      } else {
        extra.textContent = "Receipt #" + record.number + " is saved in Receipt History on this device. Log in to keep it across devices.";
      }
    }
    $("#saveDialog").hidden = false;
  }

  async function resetAfterSave(currency, template) {
    var keptCurrency = currency || $("#currency").value;
    var keptStyle = template || styleName;
    editingId = null;
    $("#editBanner").hidden = true;
    $("#custName").value = "";
    clearPhone("#custPhone", false);
    var custEl = $("#custPhone");
    if (custEl && window.ReceiptlyPhone && ReceiptlyPhone.widgetFor) {
      var cw = ReceiptlyPhone.widgetFor(custEl);
      var defIso = customerDefaultIso();
      if (cw && defIso) cw.setIso(defIso);
    }
    $("#custEmail").value = "";
    $("#notes").value = "";
    $("#discount").value = "";
    var bizTax = await ReceiptlyStorage.getBusiness();
    $("#taxPct").value = (bizTax && bizTax.taxPct) || "";
    $("#amountPaid").value = "";
    $("#receiptDate").value = ReceiptlyVal.today();
    $("#receiptTime").value = ReceiptlyVal.nowTime();
    $("#paymentMethod").value = "Cash";
    if ($("#paymentStatus")) $("#paymentStatus").value = "UNPAID";
    $("#currency").value = keptCurrency;
    setStyle(keptStyle);
    var prefix = $("#prefix").value || "RCT-";
    var seqPeek = await (ReceiptlyStorage.peekNumber ? ReceiptlyStorage.peekNumber() : ReceiptlyStorage.getMeta("sequence", 0));
    $("#receiptNo").value = ReceiptlyStorage.formatNumber(Number(seqPeek) + 1, prefix);
    renderItems([defaultItem()]);
    await applyStoredBusiness();
  }

  async function newReceipt() {
    var myGen = authGen;
    editingId = null;
    lastSavedId = null;
    $("#editBanner").hidden = true;
    $("#saveDialog").hidden = true;
    var biz = await ReceiptlyStorage.getBusiness();
    if (myGen !== authGen) return;
    $("#custName").value = "";
    clearPhone("#custPhone", false);
    var custEl = $("#custPhone");
    if (custEl && window.ReceiptlyPhone && ReceiptlyPhone.widgetFor) {
      var cw = ReceiptlyPhone.widgetFor(custEl);
      var defIso = customerDefaultIso();
      if (cw && defIso) cw.setIso(defIso);
    }
    $("#custEmail").value = "";
    $("#notes").value = "";
    $("#discount").value = "";
    $("#taxPct").value = (biz && biz.taxPct) || "";
    $("#amountPaid").value = "";
    $("#receiptDate").value = ReceiptlyVal.today();
    $("#receiptTime").value = ReceiptlyVal.nowTime();
    $("#paymentMethod").value = "Cash";
    if ($("#paymentStatus")) $("#paymentStatus").value = "UNPAID";
    if (biz) fillBusiness(biz);
    var prefix = $("#prefix").value || "RCT-";
    var seqPeek = await (ReceiptlyStorage.peekNumber ? ReceiptlyStorage.peekNumber() : ReceiptlyStorage.getMeta("sequence", 0));
    $("#receiptNo").value = ReceiptlyStorage.formatNumber(Number(seqPeek) + 1, prefix);
    renderItems([defaultItem()]);
  }

  function formIsDirty() {
    if (saving) return false;
    var cust = ($("#custName") && $("#custName").value.trim()) || "";
    var notes = ($("#notes") && $("#notes").value.trim()) || "";
    var hasItem = $$("#itemsList .item-row").some(function (row) {
      return $("[data-k=name]", row) && $("[data-k=name]", row).value.trim();
    });
    return !!(cust || notes || hasItem);
  }

  function persistOpenForm() {
    try {
      if (!formIsDirty()) {
        localStorage.removeItem(formDraftKey());
        return;
      }
      var items = $$("#itemsList .item-row").map(function (row) {
        return { name: $("[data-k=name]", row).value, qty: $("[data-k=qty]", row).value, price: $("[data-k=price]", row).value };
      });
      localStorage.setItem(formDraftKey(), JSON.stringify({
        customer: (function () {
          var cp = readPhone("#custPhone");
          return { name: $("#custName").value, phone: cp.phone, phoneCountry: cp.country, email: $("#custEmail").value };
        })(),
        notes: $("#notes").value,
        discount: $("#discount").value,
        taxPct: $("#taxPct").value,
        amountPaid: $("#amountPaid").value,
        paymentMethod: $("#paymentMethod").value,
        paymentStatus: $("#paymentStatus") ? $("#paymentStatus").value : "UNPAID",
        currency: $("#currency") ? $("#currency").value : "",
        items: items
      }));
    } catch (e) { /* ignore */ }
  }

  function clearOpenForm() {
    try { localStorage.removeItem(formDraftKey()); } catch (e) { /* ignore */ }
  }

  function restoreOpenForm() {
    try {
      var raw = localStorage.getItem(formDraftKey());
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (!d) return false;
      if (d.customer) {
        $("#custName").value = d.customer.name || "";
        writePhone("#custPhone", d.customer.phone || "", d.customer.phoneCountry || "");
        $("#custEmail").value = d.customer.email || "";
      }
      if (d.notes != null) $("#notes").value = d.notes;
      if (d.discount != null) $("#discount").value = d.discount;
      if (d.taxPct != null) $("#taxPct").value = d.taxPct;
      if (d.amountPaid != null) $("#amountPaid").value = d.amountPaid;
      if (d.paymentMethod) $("#paymentMethod").value = d.paymentMethod;
      if (d.paymentStatus && $("#paymentStatus")) $("#paymentStatus").value = d.paymentStatus;
      if (d.currency && $("#currency")) $("#currency").value = d.currency;
      if (d.items && d.items.length) renderItems(d.items);
      updateItemTotals();
      return true;
    } catch (e) {
      return false;
    }
  }

  function scheduleOpenForm() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(persistOpenForm, 400);
  }

  async function saveDraft() {
    try {
      if (window.ReceiptlyUsage && !ReceiptlyUsage.canPersist()) {
        ReceiptlyUsage.showGate();
        return;
      }
      if (!$("#receiptNo").value.trim()) await assignNumberIfNeeded();
      var data = readForm();
      data.number = $("#receiptNo").value.trim();
      if (!data.date) data.date = ReceiptlyVal.today();
      if (!data.time) data.time = ReceiptlyVal.nowTime();
      var now = new Date().toISOString();
      var record = {
        id: editingId || ReceiptlyVal.uid(),
        createdAt: now,
        updatedAt: now,
        isDraft: true,
        syncStatus: "pending",
        shareToken: window.ReceiptlyShare ? ReceiptlyShare.makeToken() : ReceiptlyVal.uid().slice(0, 10)
      };
      if (editingId) {
        var prev = await ReceiptlyStorage.getReceipt(editingId);
        record = Object.assign({}, prev, data, record, {
          id: editingId,
          createdAt: prev && prev.createdAt ? prev.createdAt : now,
          shareToken: (prev && prev.shareToken) || record.shareToken
        });
      } else {
        record = Object.assign({}, data, record);
      }
      if (window.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId()) {
        record.userId = ReceiptlyAccount.userId();
      }
      await ReceiptlyStorage.saveReceipt(record);
      if (window.ReceiptlySync && ReceiptlySync.pushOne) await ReceiptlySync.pushOne(record);
      if (window.ReceiptlyActivity) ReceiptlyActivity.log("draft_saved", { number: record.number });
      lastSavedId = record.id;
      editingId = record.id;
      ReceiptlyUI.toast("Draft saved. Open History to continue later.");
    } catch (e) {
      ReceiptlyUI.toast("Unable to save draft.", "error");
    }
  }

  async function loadCustomerOptions() {
    var list = $("#custNameList");
    if (!list) return;
    var rows = await ReceiptlyStorage.getVisibleReceipts();
    var seen = {};
    list.innerHTML = "";
    rows.forEach(function (r) {
      var name = r.customer && r.customer.name && String(r.customer.name).trim();
      if (!name) return;
      var key = name.toLowerCase();
      if (seen[key]) return;
      seen[key] = r.customer;
      var opt = document.createElement("option");
      opt.value = name;
      list.appendChild(opt);
    });
    window.__receiptlyCustomers = seen;
  }

  function bind() {
    mountPhones();
    $("#itemsList").addEventListener("input", updateItemTotals);
    $("#itemsList").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-del]");
      if (!btn) return;
      var rows = $$("#itemsList .item-row");
      if (rows.length === 1) {
        renderItems([defaultItem()]);
      } else {
        btn.closest(".item-row").remove();
        var leftover = $$("#itemsList .item-row").map(function (row) {
          return { name: $("[data-k=name]", row).value, qty: $("[data-k=qty]", row).value, price: $("[data-k=price]", row).value };
        });
        renderItems(leftover);
      }
    });
    $("#addItem").addEventListener("click", function () {
      var items = $$("#itemsList .item-row").map(function (row) {
        return { name: $("[data-k=name]", row).value, qty: $("[data-k=qty]", row).value, price: $("[data-k=price]", row).value };
      });
      items.push(defaultItem());
      renderItems(items);
    });

    var createdTracked = false;
    function markCreated() {
      if (createdTracked || !window.ReceiptlyAnalytics) return;
      createdTracked = true;
      ReceiptlyAnalytics.track("receipt_created", { page: "generator" });
    }
    $("#itemsList").addEventListener("input", markCreated);
    ["discount", "taxPct", "amountPaid", "currency", "paymentMethod", "paymentStatus", "receiptNo", "receiptDate", "receiptTime", "notes",
      "bizName", "bizAddress", "bizPhone", "bizEmail", "bizWebsite", "custName", "custPhone", "custEmail"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", updateItemTotals);
      el.addEventListener("change", updateItemTotals);
    });

    $("#logoFile").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        $("#logoError").textContent = "Please choose an image file.";
        return;
      }
      $("#logoError").textContent = "";
      var reader = new FileReader();
      reader.onload = function () {
        logoData = reader.result;
        updateItemTotals();
      };
      reader.readAsDataURL(file);
    });
    $("#removeLogo").addEventListener("click", function () {
      logoData = "";
      $("#logoFile").value = "";
      updateItemTotals();
    });

    var changeT = $("#changeTemplate");
    if (changeT) changeT.addEventListener("click", openTemplates);
    var closeT = $("#closeTemplates");
    if (closeT) closeT.addEventListener("click", function () { $("#templateDialog").hidden = true; });
    var bizToggle = $("#bizToggle");
    if (bizToggle) bizToggle.addEventListener("click", function () {
      var fields = $("#bizFields");
      collapseBiz(!fields.hidden);
    });
    var bizEdit = $("#bizEdit");
    if (bizEdit) bizEdit.addEventListener("click", function () {
      collapseBiz(false);
      var name = $("#bizName");
      if (name) name.focus();
    });

    $("#saveBiz").addEventListener("click", async function () {
      var bp = readPhone("#bizPhone");
      await ReceiptlyStorage.saveBusiness({
        name: $("#bizName").value,
        address: $("#bizAddress").value,
        phone: bp.phone,
        phoneCountry: bp.country,
        email: $("#bizEmail").value,
        website: $("#bizWebsite").value,
        logo: logoData,
        prefix: $("#prefix").value || "RCT-",
        currency: $("#currency") ? $("#currency").value : "NGN",
        template: styleName,
        taxPct: $("#taxDefault") ? $("#taxDefault").value : ($("#taxPct") ? $("#taxPct").value : ""),
        footer: ($("#bizFooter") && $("#bizFooter").value) || ""
      });
      ReceiptlyUI.toast("Settings saved");
      if (window.ReceiptlySync && ReceiptlySync.pushBusiness) {
        try { await ReceiptlySync.pushBusiness(); } catch (e) { /* still saved locally */ }
      }
      collapseBiz(true);
    });

    var custName = $("#custName");
    if (custName) {
      custName.addEventListener("change", function () {
        var map = window.__receiptlyCustomers || {};
        var hit = map[String(custName.value || "").trim().toLowerCase()];
        if (!hit) return;
        if (hit.phone || hit.phoneCountry) writePhone("#custPhone", hit.phone || "", hit.phoneCountry || "");
        if (hit.email) $("#custEmail").value = hit.email;
        updateItemTotals();
      });
    }
    var draftBtn = $("#draftBtn");
    if (draftBtn) draftBtn.addEventListener("click", saveDraft);
    $("#saveBtn").addEventListener("click", saveReceipt);
    $("#printBtn").addEventListener("click", function () {
      window.print();
      if (window.ReceiptlyAnalytics) ReceiptlyAnalytics.track("receipt_printed", { page: "generator" });
    });
    $("#pdfBtn").addEventListener("click", async function () {
      await ReceiptlyUI.withBusy($("#pdfBtn"), "Preparing PDF…", async function () {
        try {
          await ReceiptlyPdf.download($("#receiptPreview"), $("#receiptNo").value || "receipt");
          ReceiptlyUI.toast("Receipt downloaded");
          if (window.ReceiptlyAnalytics) ReceiptlyAnalytics.track("receipt_downloaded", { page: "generator" });
        } catch (e) {
          if (window.ReceiptlyErrors) ReceiptlyErrors.report("pdf failed", "pdf");
          ReceiptlyUI.toast("PDF library is still loading. Try again in a moment.", "error");
        }
      });
    });
    async function sendSaved() {
      if (!lastSavedId) {
        ReceiptlyUI.toast("Save the receipt first, then send it.", "error");
        return;
      }
      var rec = await ReceiptlyStorage.getReceipt(lastSavedId);
      if (window.ReceiptlyShare) ReceiptlyShare.open(rec);
    }
    var sendBtn = $("#sendBtn");
    if (sendBtn) sendBtn.addEventListener("click", sendSaved);
    var dlgSend = $("#dlgSend");
    if (dlgSend) dlgSend.addEventListener("click", function () {
      $("#saveDialog").hidden = true;
      sendSaved();
    });
    $("#dlgView").addEventListener("click", function () {
      if (lastSavedId) location.href = "records.html?view=" + encodeURIComponent(lastSavedId);
    });
    var dlgDownload = $("#dlgDownload");
    if (dlgDownload) dlgDownload.addEventListener("click", async function () {
      if (!lastSavedId) return;
      var rec = await ReceiptlyStorage.getReceipt(lastSavedId);
      try {
        if (window.ReceiptlyShare && ReceiptlyShare.downloadImage) await ReceiptlyShare.downloadImage(rec);
        else await ReceiptlyPdf.download($("#receiptPreview"), rec && rec.number);
      } catch (e) {
        ReceiptlyUI.toast("Unable to download right now. Try again.", "error");
      }
    });
    var dlgRecords = $("#dlgRecords");
    if (dlgRecords) dlgRecords.addEventListener("click", function () { location.href = "records.html"; });
    $("#saveDialog").addEventListener("click", function (e) {
      if (e.target.id === "saveDialog") $("#saveDialog").hidden = true;
    });

    var form = $("#receiptForm");
    if (form) form.addEventListener("input", scheduleOpenForm);
    window.addEventListener("beforeunload", function (e) {
      if (!formIsDirty()) return;
      persistOpenForm();
      e.preventDefault();
      e.returnValue = "";
    });
    document.addEventListener("click", async function (e) {
      var a = e.target.closest("a[href]");
      if (!a || a.target === "_blank") return;
      var href = a.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#") return;
      if (href.indexOf("javascript:") === 0) return;
      if (!formIsDirty()) return;
      if (/index\.html($|#)/.test(href) && !/[?&](edit|duplicate)=/.test(href)) return;
      e.preventDefault();
      persistOpenForm();
      var leave = await ReceiptlyUI.confirm({
        title: "Leave this receipt?",
        message: "You have unsaved changes. Your information may be lost.",
        confirmLabel: "Leave",
        cancelLabel: "Stay"
      });
      if (leave) location.href = a.href;
    });
  }

  async function boot() {
    if (!$("#receiptPreview")) return;
    bind();
    if (window.ReceiptlyAccount && ReceiptlyAccount.ready) await ReceiptlyAccount.ready;
    var bootGen = authGen;
    if (window.ReceiptlySync) {
      Promise.resolve(ReceiptlySync.sync()).then(function () {
        if (bootGen !== authGen) return;
        return applyStoredBusiness();
      }).catch(function () { /* local form still usable */ });
    }
    var params = new URLSearchParams(location.search);
    var editId = params.get("edit");
    var dupId = params.get("duplicate");
    var biz = await ReceiptlyStorage.getBusiness();
    fillBusiness(biz);
    await loadCustomerOptions();
    $("#receiptDate").value = ReceiptlyVal.today();
    $("#receiptTime").value = ReceiptlyVal.nowTime();

    if (editId) {
      var rec = await ReceiptlyStorage.getReceipt(editId);
      if (rec) {
        editingId = rec.id;
        fillRecord(rec);
        return;
      }
    }
    if (dupId) {
      var src = await ReceiptlyStorage.getReceipt(dupId);
      if (src) {
        editingId = null;
        var copy = JSON.parse(JSON.stringify(src));
        copy.date = ReceiptlyVal.today();
        copy.time = ReceiptlyVal.nowTime();
        var seq = await (ReceiptlyStorage.peekNumber ? ReceiptlyStorage.peekNumber() : ReceiptlyStorage.getMeta("sequence", 0));
        copy.number = ReceiptlyStorage.formatNumber(Number(seq) + 1, (biz && biz.prefix) || "RCT-");
        fillRecord(copy);
        $("#editBanner").hidden = true;
        ReceiptlyUI.toast("Duplicated. Save to create a new record.");
        return;
      }
    }
    var seq = await (ReceiptlyStorage.peekNumber ? ReceiptlyStorage.peekNumber() : ReceiptlyStorage.getMeta("sequence", 0));
    $("#receiptNo").value = ReceiptlyStorage.formatNumber(Number(seq) + 1, (biz && biz.prefix) || "RCT-");
    renderItems([defaultItem()]);
    restoreOpenForm();
  }

  function businessFromReceipts(rows) {
    var list = (rows || []).slice();
    list.sort(function (a, b) {
      var sa = String((a && (a.updatedAt || a.createdAt || a.date)) || "");
      var sb = String((b && (b.updatedAt || b.createdAt || b.date)) || "");
      return sa < sb ? 1 : -1;
    });
    var i;
    for (i = 0; i < list.length; i++) {
      var b = list[i] && list[i].business;
      if (b && (b.name || b.address || b.phone || b.email || b.website || b.logo)) return b;
    }
    return null;
  }

  function mergeBizFallback(saved, fromReceipt) {
    var base = ReceiptlyStorage.emptyBusiness ? ReceiptlyStorage.emptyBusiness() : {};
    var out = Object.assign({}, base, saved || {});
    var src = fromReceipt || {};
    if (!out.name && src.name) out.name = src.name;
    if (!out.address && src.address) out.address = src.address;
    if (!out.phone && src.phone) out.phone = src.phone;
    if (!out.email && src.email) out.email = src.email;
    if (!out.website && src.website) out.website = src.website;
    if (!out.logo && src.logo) out.logo = src.logo;
    if ((!out.footer || out.footer === "") && src.footer) out.footer = src.footer;
    if ((!out.prefix || out.prefix === "RCT-") && src.prefix) out.prefix = src.prefix;
    if ((!out.taxPct || out.taxPct === "") && src.taxPct) out.taxPct = src.taxPct;
    return out;
  }

  async function applyStoredBusiness() {
    if (!$("#bizName")) return;
    var myGen = authGen;
    var biz = await ReceiptlyStorage.getBusiness();
    if (myGen !== authGen) return;
    var filled = !!(biz && (biz.name || biz.address || biz.phone || biz.email || biz.website || biz.logo));
    if (!filled && ReceiptlyStorage.getVisibleReceipts) {
      var rows = await ReceiptlyStorage.getVisibleReceipts();
      if (myGen !== authGen) return;
      biz = mergeBizFallback(biz, businessFromReceipts(rows));
    }
    fillBusiness(biz || (ReceiptlyStorage.emptyBusiness ? ReceiptlyStorage.emptyBusiness() : {}));
    if (!(biz && biz.name)) collapseBiz(false);
  }

  document.addEventListener("receiptly-auth-change", function () {
    var myGen = ++authGen;
    clearTimeout(draftTimer);
    var shareDialog = $("#shareDialog");
    if (shareDialog) shareDialog.hidden = true;
    editingId = null;
    logoData = "";
    lastSavedId = null;
    Promise.resolve(newReceipt()).then(function () {
      if (myGen !== authGen) return;
      return applyStoredBusiness();
    }).then(function () {
      if (myGen !== authGen) return;
      restoreOpenForm();
    }).catch(function () {
      if (myGen !== authGen) return;
      applyStoredBusiness();
    });
  });

  document.addEventListener("DOMContentLoaded", boot);
})();
