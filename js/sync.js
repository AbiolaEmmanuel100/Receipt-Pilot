(function (global) {
  "use strict";

  var busy = false;
  var pendingResync = false;

  function sb() {
    return global.ReceiptlyCloud && ReceiptlyCloud.configured() && ReceiptlyCloud.client();
  }

  function uid() {
    return global.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId();
  }

  function online() {
    return typeof navigator === "undefined" || navigator.onLine;
  }

  function toast(msg, type) {
    if (global.ReceiptlyUI) ReceiptlyUI.toast(msg, type);
  }

  function chip(msg, sticky) {
    if (global.ReceiptlyAccount && ReceiptlyAccount.updateChip) ReceiptlyAccount.updateChip(msg, sticky);
  }

  function toRow(record, user) {
    var payload = Object.assign({}, record);
    delete payload.payload;
    return {
      id: record.id,
      user_id: user,
      receipt_number: record.number,
      customer_name: (record.customer && record.customer.name) || "",
      customer_phone: (record.customer && record.customer.phone) || "",
      customer_email: (record.customer && record.customer.email) || "",
      subtotal: Number(record.subtotal) || 0,
      discount: Number(record.discount) || 0,
      tax: Number(record.tax) || 0,
      tax_pct: Number(record.taxPct) || 0,
      total: Number(record.grand) || 0,
      amount_paid: Number(record.paid) || 0,
      outstanding: Number(record.balance) || 0,
      payment_status: record.status || "UNPAID",
      payment_method: record.payment || "Cash",
      currency: record.currency || "NGN",
      template_id: record.template || "classic",
      receipt_date: record.date || null,
      receipt_time: record.time || "",
      notes: record.notes || "",
      payload: payload,
      created_at: record.createdAt || new Date().toISOString(),
      updated_at: record.updatedAt || new Date().toISOString(),
      deleted_at: record.deletedAt || null
    };
  }

  function fromRow(row) {
    var rec = row.payload && typeof row.payload === "object" ? Object.assign({}, row.payload) : {};
    rec.id = row.id;
    rec.number = row.receipt_number || rec.number;
    rec.userId = row.user_id;
    rec.syncStatus = "synced";
    rec.updatedAt = row.updated_at;
    rec.createdAt = row.created_at;
    rec.status = row.payment_status || rec.status;
    rec.grand = row.total != null ? Number(row.total) : rec.grand;
    rec.paid = row.amount_paid != null ? Number(row.amount_paid) : rec.paid;
    rec.balance = row.outstanding != null ? Number(row.outstanding) : rec.balance;
    rec.template = row.template_id || rec.template;
    rec.currency = row.currency || rec.currency;
    rec.date = row.receipt_date || rec.date;
    if (!rec.customer) {
      rec.customer = {
        name: row.customer_name || "",
        phone: row.customer_phone || "",
        email: row.customer_email || ""
      };
    }
    rec.deletedAt = row.deleted_at || null;
    return rec;
  }

  function isNumberConflict(err) {
    if (!err) return false;
    var c = String(err.code || "");
    var m = String(err.message || "") + " " + String(err.details || "") + " " + String(err.hint || "");
    return c === "23505" || /duplicate key|receipts_user_number_uidx|unique constraint.*receipt_number/i.test(m);
  }

  function numberPrefix(number, fallback) {
    var n = String(number || "");
    var m = n.match(/^(.*?)(\d+)$/);
    if (m && m[1]) return m[1];
    return fallback || "RCT-";
  }

  async function allocateReceiptNumber(prefix) {
    var pref = prefix || "RCT-";
    var localMax = 0;
    if (ReceiptlyStorage.catchUpSequence) {
      localMax = Number(await ReceiptlyStorage.catchUpSequence(null, pref)) || 0;
    }
    var client = sb();
    if (client) {
      try {
        var res = await client.rpc("allocate_receipt_number", { p_prefix: pref });
        if (!res.error && res.data) {
          var remote = ReceiptlyStorage.parseSeqFromNumber(String(res.data), pref);
          if (remote > localMax) {
            await ReceiptlyStorage.catchUpSequence([String(res.data)], pref);
            return String(res.data);
          }
        }
      } catch (e) { /* local fallback */ }
    }
    var seq = await ReceiptlyStorage.nextNumber();
    return ReceiptlyStorage.formatNumber(seq, pref);
  }

  function refreshSuggestedNumber(seq, prefix) {
    var el = document.getElementById("receiptNo");
    if (!el) return;
    var banner = document.getElementById("editBanner");
    if (banner && !banner.hidden) return;
    var current = String(el.value || "").trim();
    var parsed = ReceiptlyStorage.parseSeqFromNumber(current, prefix);
    if (!current || (parsed > 0 && parsed <= seq)) {
      el.value = ReceiptlyStorage.formatNumber(Number(seq) + 1, prefix);
    }
  }

  async function catchUpAfterPull(remote) {
    var biz = await ReceiptlyStorage.getBusiness();
    var prefix = (biz && biz.prefix) || "RCT-";
    var extra = (remote || []).map(function (r) { return r && r.receipt_number; });
    var seq = await ReceiptlyStorage.catchUpSequence(extra, prefix);
    refreshSuggestedNumber(seq, prefix);
    return seq;
  }

  async function upsertItems(client, record, user) {
    await client.from("receipt_items").delete().eq("receipt_id", record.id);
    var items = Array.isArray(record.items) ? record.items : [];
    if (!items.length) return;
    var rows = items.map(function (it, i) {
      return {
        receipt_id: record.id,
        user_id: user,
        name: it.name || "",
        quantity: Number(it.qty) || 0,
        unit_price: Number(it.price) || 0,
        line_total: Number(it.total) || 0,
        sort_order: i
      };
    });
    var res = await client.from("receipt_items").insert(rows);
    if (res.error) throw res.error;
  }

  async function pushOne(record) {
    var client = sb();
    var user = uid();
    if (!client || !user || !online()) {
      chip("Saved offline. It will sync when you're back online.", true);
      return false;
    }
    try {
      var existing = await client.from("receipts").select("id, updated_at, receipt_number").eq("id", record.id).maybeSingle();
      if (existing.data) {
        if (existing.data.receipt_number) record.number = existing.data.receipt_number;
        if (existing.data.updated_at && record.updatedAt && existing.data.updated_at > record.updatedAt) {
          if (record.syncStatus === "pending") return false;
          return true;
        }
        var lockedRow = toRow(record, user);
        var lockedUp = await client.from("receipts").upsert(lockedRow, { onConflict: "id" });
        if (lockedUp.error) throw lockedUp.error;
        await upsertItems(client, record, user);
        await ReceiptlyStorage.putReceiptSynced(Object.assign({}, record, { userId: user }));
        return true;
      }

      var attempts = 0;
      while (attempts < 6) {
        var row = toRow(record, user);
        var up = await client.from("receipts").upsert(row, { onConflict: "id" });
        if (!up.error) {
          await upsertItems(client, record, user);
          await ReceiptlyStorage.putReceiptSynced(Object.assign({}, record, { userId: user }));
          return true;
        }
        if (!isNumberConflict(up.error)) throw up.error;
        var biz = await ReceiptlyStorage.getBusiness();
        var prefix = numberPrefix(record.number, (biz && biz.prefix) || "RCT-");
        var next = await allocateReceiptNumber(prefix);
        if (!next || next === record.number) {
          var seq = await ReceiptlyStorage.nextNumber();
          next = ReceiptlyStorage.formatNumber(seq, prefix);
        }
        record.number = next;
        record.updatedAt = new Date().toISOString();
        record.syncStatus = "pending";
        record.userId = user;
        await ReceiptlyStorage.saveReceipt(record);
        await ReceiptlyStorage.catchUpSequence([next], prefix);
        attempts += 1;
      }
      throw new Error("receipt_number_conflict");
    } catch (e) {
      console.warn("Receipt Pilot push failed:", (e && e.message) || e, e);
      chip("Unable to sync right now. Your receipt is still saved on this device.", true);
      if (global.ReceiptlyErrors) ReceiptlyErrors.report((e && e.message) || "push", "sync");
      return false;
    }
  }

  async function pushTombstones() {
    var client = sb();
    var user = uid();
    if (!client || !user) return;
    var stones = await ReceiptlyStorage.listTombstones();
    for (var i = 0; i < stones.length; i++) {
      var id = stones[i].id;
      var rec = await ReceiptlyStorage.getReceipt(id);
      if (rec && rec.userId !== user) continue;
      if (rec && !rec.userId) continue;
      var res = await client.from("receipts")
        .update({ deleted_at: stones[i].deletedAt || new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user);
      if (!res.error) await ReceiptlyStorage.clearTombstone(id);
    }
  }

  async function pullReceipts() {
    var client = sb();
    var user = uid();
    if (!client || !user) return;
    var res = await client.from("receipts").select("*").eq("user_id", user);
    if (res.error) throw res.error;
    var remote = res.data || [];
    for (var i = 0; i < remote.length; i++) {
      var row = remote[i];
      if (row.deleted_at) {
        var deletedRec = fromRow(row);
        deletedRec.deletedAt = row.deleted_at;
        deletedRec.syncStatus = "synced";
        await ReceiptlyStorage.putReceiptSynced(deletedRec);
        await ReceiptlyStorage.clearTombstone(row.id);
        continue;
      }
      var rec = fromRow(row);
      var local = await ReceiptlyStorage.getReceipt(rec.id);
      if (local && local.syncStatus === "pending") {
        if (local.updatedAt && rec.updatedAt && rec.updatedAt > local.updatedAt) {
          continue;
        }
        await pushOne(local);
      } else if (!local || !local.updatedAt || rec.updatedAt >= local.updatedAt) {
        await ReceiptlyStorage.putReceiptSynced(rec);
      }
    }
    await catchUpAfterPull(remote);
  }

  async function pushBusiness() {
    var client = sb();
    var user = uid();
    if (!client || !user || !online()) return;
    var biz = await ReceiptlyStorage.getBusiness();
    if (!biz) return;
    var row = {
      user_id: user,
      business_name: biz.name || "",
      address: biz.address || "",
      phone: biz.phone || "",
      email: biz.email || "",
      website: biz.website || "",
      logo: biz.logo || "",
      footer: biz.footer || "",
      prefix: biz.prefix || "RCT-",
      currency: biz.currency || "NGN",
      updated_at: new Date().toISOString()
    };
    var res = await client.from("business_information").upsert(row, { onConflict: "user_id" });
    if (res.error) throw res.error;
    if (biz.template) {
      await client.from("user_settings").upsert({
        user_id: user,
        default_template: biz.template,
        currency: biz.currency || "NGN",
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
    }
    if (ReceiptlyStorage.putBusinessSynced) {
      await ReceiptlyStorage.putBusinessSynced(Object.assign({}, biz, { updatedAt: row.updated_at }));
    }
  }

  async function pullBusiness() {
    var client = sb();
    var user = uid();
    if (!client || !user) return;
    var bizRes = await client.from("business_information").select("*").eq("user_id", user).maybeSingle();
    var setRes = await client.from("user_settings").select("*").eq("user_id", user).maybeSingle();
    var local = await ReceiptlyStorage.getBusiness();
    var remote = bizRes.data;
    if (remote) {
      var remoteEmpty = !(remote.business_name || remote.address || remote.phone || remote.email || remote.website || remote.logo);
      var localFilled = !!(local && (local.name || local.address || local.phone || local.email || local.website || local.logo));
      var localNewer = local && local.updatedAt && remote.updated_at && local.updatedAt > remote.updated_at && local.syncStatus === "pending";
      if (remoteEmpty && localFilled) {
        return;
      }
      if (!localNewer) {
        await ReceiptlyStorage.putBusinessSynced({
          name: remote.business_name,
          address: remote.address,
          phone: remote.phone,
          email: remote.email,
          website: remote.website,
          logo: remote.logo,
          prefix: remote.prefix,
          currency: remote.currency,
          footer: remote.footer || (local && local.footer) || "",
          template: (setRes.data && setRes.data.default_template) || (local && local.template) || "classic",
          updatedAt: remote.updated_at
        });
      }
    }
  }

  async function pushPending() {
    var pending = await ReceiptlyStorage.listPendingReceipts();
    var user = uid();
    if (!user) return;
    for (var i = 0; i < pending.length; i++) {
      var rec = pending[i];
      if (!rec.userId || rec.userId !== user) continue;
      await pushOne(rec);
    }
  }

  async function sync() {
    if (busy) {
      pendingResync = true;
      return;
    }
    if (!sb() || !uid()) return;
    if (!online()) {
      chip("Offline — Changes saved on this device", true);
      return;
    }
    var startedUid = uid();
    if (!startedUid) return;
    busy = true;
    pendingResync = false;
    var failed = null;
    function stillMine() {
      return uid() === startedUid;
    }
    async function step(name, fn) {
      if (!stillMine()) return;
      try {
        await fn();
      } catch (e) {
        failed = e;
        console.warn("Receipt Pilot sync step failed (" + name + "):", (e && e.message) || e, e);
        if (global.ReceiptlyErrors) ReceiptlyErrors.report((e && e.message) || name, "sync");
      }
    }
    try {
      await step("tombstones", pushTombstones);
      await step("pushPending", pushPending);
      await step("pullReceipts", pullReceipts);
      await step("pushBusiness", pushBusiness);
      await step("pullBusiness", pullBusiness);
      if (!stillMine()) {
        pendingResync = true;
      } else if (failed) {
        chip("Unable to sync right now. Your receipt is still saved on this device.", true);
      } else {
        var leftover = [];
        try {
          leftover = await ReceiptlyStorage.listPendingReceipts();
        } catch (e) { leftover = []; }
        var user = uid();
        var stillPending = (leftover || []).some(function (rec) {
          if (!rec || rec.syncStatus !== "pending") return false;
          if (!user) return !rec.userId;
          return rec.userId === user;
        });
        if (stillPending) chip("Some changes are still waiting to sync.", true);
        else chip("Records synchronized successfully.");
      }
    } finally {
      busy = false;
      if (pendingResync && uid() && online()) {
        pendingResync = false;
        Promise.resolve(sync()).catch(function () { /* follow-up sync is best-effort */ });
      }
    }
  }

  async function remove(id) {
    var rec = await ReceiptlyStorage.getReceipt(id);
    if (rec && !rec.deletedAt) await ReceiptlyStorage.trashReceipt(id);
    rec = await ReceiptlyStorage.getReceipt(id);
    if (rec) await pushOne(rec);
  }

  async function restore(id) {
    await ReceiptlyStorage.restoreReceipt(id);
    var rec = await ReceiptlyStorage.getReceipt(id);
    if (rec) await pushOne(rec);
  }

  async function purge(id) {
    var user = uid();
    var client = sb();
    await ReceiptlyStorage.purgeReceipt(id);
    if (client && user && online()) {
      try {
        await client.from("receipts").delete().eq("id", id).eq("user_id", user);
      } catch (e) { /* local already gone */ }
    }
  }

  async function restoreAll() {
    var user = uid();
    if (!user) return { ok: false, needAuth: true };
    var rows = await ReceiptlyStorage.getTrashedReceipts();
    for (var i = 0; i < rows.length; i++) {
      await restore(rows[i].id);
    }
    return { ok: true, count: rows.length };
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (global.ReceiptlyAccount && ReceiptlyAccount.ready) {
      ReceiptlyAccount.ready.then(function () {
        if (online()) sync();
      });
    }
  });

  global.ReceiptlySync = {
    sync: sync,
    push: sync,
    pull: sync,
    pushOne: pushOne,
    allocateReceiptNumber: allocateReceiptNumber,
    pushBusiness: pushBusiness,
    remove: remove,
    restore: restore,
    purge: purge,
    restoreAll: restoreAll
  };
})(window);
