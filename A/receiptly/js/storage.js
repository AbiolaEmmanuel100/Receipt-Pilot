(function (global) {
  "use strict";

  var DB_NAME = "receiptly_db";
  var DB_VERSION = 2;
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        var tx = e.target.transaction;
        if (!db.objectStoreNames.contains("receipts")) {
          var store = db.createObjectStore("receipts", { keyPath: "id" });
          store.createIndex("number", "number", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("date", "date", { unique: false });
          store.createIndex("status", "status", { unique: false });
        } else if (e.oldVersion < 2) {
          var existing = tx.objectStore("receipts");
          try { existing.deleteIndex("number"); } catch (err) { /* ignore */ }
          try { existing.createIndex("number", "number", { unique: false }); } catch (err2) { /* ignore */ }
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("tombstones")) {
          db.createObjectStore("tombstones", { keyPath: "id" });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function reqToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function getMeta(key, fallback) {
    return openDb().then(function (db) {
      var tx = db.transaction("meta", "readonly");
      return reqToPromise(tx.objectStore("meta").get(key));
    }).then(function (row) {
      return row ? row.value : fallback;
    });
  }

  function setMeta(key, value) {
    return openDb().then(function (db) {
      var tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put({ key: key, value: value });
      return new Promise(function (resolve, reject) {
        tx.oncomplete = function () { resolve(value); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function sequenceKey() {
    var uid = currentUserId();
    return uid ? ("sequence:" + uid) : "sequence";
  }

  function nextNumber() {
    return peekNumber().then(function (seq) {
      var next = Number(seq) + 1;
      return setMeta(sequenceKey(), next).then(function () { return next; });
    });
  }

  function peekNumber() {
    return getBusiness().then(function (biz) {
      return catchUpSequence(null, (biz && biz.prefix) || "RCT-");
    });
  }

  function formatNumber(seq, prefix) {
    var p = prefix || "RCT-";
    return p + String(seq).padStart(6, "0");
  }

  function parseSeqFromNumber(number, prefix) {
    var n = String(number == null ? "" : number);
    var p = String(prefix == null || prefix === "" ? "RCT-" : prefix);
    if (p && n.indexOf(p) === 0) {
      var rest = n.slice(p.length);
      if (/^[0-9]+$/.test(rest)) return parseInt(rest, 10) || 0;
    }
    var m = n.match(/(\d+)\s*$/);
    return m ? (parseInt(m[1], 10) || 0) : 0;
  }

  function catchUpSequence(extraNumbers, prefix) {
    var uid = currentUserId();
    var prefixP = prefix
      ? Promise.resolve(prefix)
      : getBusiness().then(function (biz) { return (biz && biz.prefix) || "RCT-"; });
    return prefixP.then(function (p) {
      return Promise.all([getMeta(sequenceKey(), 0), getAllRows()]).then(function (parts) {
        var current = Number(parts[0]) || 0;
        var max = current;
        (parts[1] || []).forEach(function (r) {
          if (!r) return;
          if (uid) {
            if (r.userId !== uid) return;
          } else if (r.userId) return;
          var num = r.number || (r.payload && r.payload.number) || "";
          if (!num) return;
          var v = parseSeqFromNumber(num, p);
          if (v > max) max = v;
        });
        (extraNumbers || []).forEach(function (num) {
          var v = parseSeqFromNumber(num, p);
          if (v > max) max = v;
        });
        if (max > current) {
          return setMeta(sequenceKey(), max).then(function () { return max; });
        }
        return max;
      });
    });
  }

  function emptyBusiness() {
    return {
      name: "", address: "", phone: "", email: "", website: "", logo: "",
      prefix: "RCT-", footer: "", currency: "NGN", template: "classic", taxPct: ""
    };
  }

  function businessFilled(biz) {
    return !!(biz && (biz.name || biz.address || biz.phone || biz.email || biz.website || biz.logo));
  }

  function adoptGuestBusinessIfNeeded() {
    var uid = currentUserId();
    if (!uid) return Promise.resolve(null);
    return Promise.all([getMeta("business:" + uid, null), getMeta("business", emptyBusiness())]).then(function (parts) {
      var owned = parts[0];
      var guest = parts[1] || emptyBusiness();
      if (!businessFilled(owned) && businessFilled(guest)) {
        var copy = Object.assign({}, emptyBusiness(), guest, {
          syncStatus: "pending",
          updatedAt: new Date().toISOString()
        });
        return setMeta("business:" + uid, copy).then(function () {
          return setMeta("business", emptyBusiness()).then(function () { return copy; });
        });
      }
      if (businessFilled(owned) && businessFilled(guest)) {
        return setMeta("business", emptyBusiness()).then(function () { return owned; });
      }
      return owned || emptyBusiness();
    });
  }

  function adoptGuestReceiptsIfNewAccount() {
    var uid = currentUserId();
    if (!uid) return Promise.resolve(false);
    // Do not silently stamp unowned receipts onto this account.
    // maybeClaimLocal() in account.js is the explicit confirmation path.
    return Promise.resolve(false);
  }

  function getBusiness() {
    return getMeta(businessMetaKey(), emptyBusiness());
  }

  function saveBusiness(biz) {
    var copy = Object.assign({}, emptyBusiness(), biz);
    copy.syncStatus = "pending";
    copy.updatedAt = new Date().toISOString();
    return setMeta(businessMetaKey(), copy);
  }

  function putBusinessSynced(biz) {
    var copy = Object.assign({}, emptyBusiness(), biz, { syncStatus: "synced" });
    if (!copy.updatedAt) copy.updatedAt = new Date().toISOString();
    return setMeta(businessMetaKey(), copy);
  }

  function saveReceipt(record) {
    var row = Object.assign({}, record);
    if (!row.syncStatus || row.syncStatus === "synced") row.syncStatus = "pending";
    if (!row.updatedAt) row.updatedAt = new Date().toISOString();
    return openDb().then(function (db) {
      var tx = db.transaction("receipts", "readwrite");
      tx.objectStore("receipts").put(row);
      return new Promise(function (resolve, reject) {
        tx.oncomplete = function () { resolve(row); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function putReceiptSynced(record) {
    var row = Object.assign({}, record, { syncStatus: "synced" });
    return openDb().then(function (db) {
      var tx = db.transaction("receipts", "readwrite");
      tx.objectStore("receipts").put(row);
      return new Promise(function (resolve, reject) {
        tx.oncomplete = function () { resolve(row); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function getReceiptRaw(id) {
    return openDb().then(function (db) {
      var tx = db.transaction("receipts", "readonly");
      return reqToPromise(tx.objectStore("receipts").get(id));
    });
  }

  function currentUserId() {
    return (global.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId()) || null;
  }

  function businessMetaKey() {
    var uid = currentUserId();
    return uid ? ("business:" + uid) : "business";
  }

  function isUnowned(rec) {
    return !!(rec && (rec.userId == null || rec.userId === ""));
  }

  function canAccessReceipt(rec) {
    if (!rec) return false;
    var uid = currentUserId();
    if (uid) return rec.userId === uid;
    return isUnowned(rec);
  }

  function getReceipt(id) {
    return getReceiptRaw(id).then(function (rec) {
      return canAccessReceipt(rec) ? rec : null;
    });
  }

  var TRASH_DAYS = 30;

  function getAllRows() {
    return openDb().then(function (db) {
      var tx = db.transaction("receipts", "readonly");
      return reqToPromise(tx.objectStore("receipts").getAll());
    }).then(function (rows) { return rows || []; });
  }

  function getReceiptByNumber(number) {
    return getAllRows().then(function (rows) {
      return rows.find(function (r) {
        if (!r) return false;
        if (String(r.number) !== String(number)) return false;
        return canAccessReceipt(r);
      }) || null;
    });
  }

  function getReceipts() {
    return getAllRows().then(function (rows) {
      return rows.filter(function (r) { return r && !r.deletedAt; });
    });
  }

  function ownerFilter(rows) {
    return (rows || []).filter(canAccessReceipt);
  }

  function getVisibleReceipts() {
    return getReceipts().then(ownerFilter);
  }

  function listUnownedReceipts() {
    return getReceipts().then(function (rows) {
      return rows.filter(isUnowned);
    });
  }

  function getTrashedReceipts() {
    return getAllRows().then(function (rows) {
      return rows.filter(function (r) { return r && r.deletedAt; });
    }).then(ownerFilter);
  }

  function listPendingReceipts() {
    return getAllRows().then(function (rows) {
      return rows.filter(function (r) { return r && r.syncStatus === "pending"; });
    });
  }

  function addTombstone(id) {
    return openDb().then(function (db) {
      var tx = db.transaction("tombstones", "readwrite");
      tx.objectStore("tombstones").put({ id: id, deletedAt: new Date().toISOString() });
      return new Promise(function (resolve, reject) {
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function listTombstones() {
    return openDb().then(function (db) {
      if (!db.objectStoreNames.contains("tombstones")) return [];
      var tx = db.transaction("tombstones", "readonly");
      return reqToPromise(tx.objectStore("tombstones").getAll());
    }).then(function (rows) { return rows || []; });
  }

  function clearTombstone(id) {
    return openDb().then(function (db) {
      var tx = db.transaction("tombstones", "readwrite");
      tx.objectStore("tombstones").delete(id);
      return new Promise(function (resolve, reject) {
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function trashReceipt(id) {
    return getReceipt(id).then(function (rec) {
      if (!rec) return;
      rec.deletedAt = new Date().toISOString();
      rec.updatedAt = rec.deletedAt;
      rec.syncStatus = "pending";
      return saveReceipt(rec).then(function () { return addTombstone(id); });
    });
  }

  function restoreReceipt(id) {
    return getReceipt(id).then(function (rec) {
      if (!rec) return;
      rec.deletedAt = null;
      rec.updatedAt = new Date().toISOString();
      rec.syncStatus = "pending";
      return saveReceipt(rec).then(function () { return clearTombstone(id); });
    });
  }

  function purgeReceiptRaw(id) {
    return openDb().then(function (db) {
      var tx = db.transaction(["receipts", "tombstones"], "readwrite");
      tx.objectStore("receipts").delete(id);
      tx.objectStore("tombstones").delete(id);
      return new Promise(function (resolve, reject) {
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function purgeReceipt(id) {
    return getReceipt(id).then(function (rec) {
      if (!rec) return;
      return purgeReceiptRaw(id);
    });
  }

  function purgeOwnedBy(uid) {
    if (!uid) return Promise.resolve();
    return getAllRows().then(function (rows) {
      var chain = Promise.resolve();
      (rows || []).forEach(function (r) {
        if (r && r.userId === uid) {
          chain = chain.then(function () { return purgeReceiptRaw(r.id); });
        }
      });
      return chain;
    });
  }

  function trashAgeDays(rec) {
    if (!rec || !rec.deletedAt) return 0;
    return Math.floor((Date.now() - new Date(rec.deletedAt).getTime()) / 86400000);
  }

  function purgeExpiredTrash() {
    return getTrashedReceipts().then(function (rows) {
      var chain = Promise.resolve();
      rows.forEach(function (r) {
        if (trashAgeDays(r) >= TRASH_DAYS) {
          chain = chain.then(function () { return purgeReceipt(r.id); });
        }
      });
      return chain;
    });
  }

  function deleteReceipt(id) {
    return trashReceipt(id);
  }

  function clearReceipts() {
    return getAllRows().then(function (rows) {
      var chain = Promise.resolve();
      (rows || []).forEach(function (r) {
        if (canAccessReceipt(r)) {
          chain = chain.then(function () { return purgeReceiptRaw(r.id).then(function () { return addTombstone(r.id); }); });
        }
      });
      return chain;
    });
  }

  function exportAll() {
    return Promise.all([getVisibleReceipts(), peekNumber(), getBusiness()]).then(function (parts) {
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        sequence: parts[1],
        business: parts[2],
        receipts: parts[0]
      };
    });
  }

  function newRecordId() {
    if (global.ReceiptlyVal && ReceiptlyVal.uid) return ReceiptlyVal.uid();
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function importAll(payload, mode) {
    if (!payload || !Array.isArray(payload.receipts)) {
      return Promise.reject(new Error("invalid"));
    }
    var uid = currentUserId();
    return getAllRows().then(function (existing) {
      var byId = {};
      (existing || []).forEach(function (row) {
        if (row && row.id) byId[row.id] = row;
      });
      return openDb().then(function (db) {
        var tx = db.transaction(["receipts", "meta"], "readwrite");
        var store = tx.objectStore("receipts");
        if (mode === "replace") {
          (existing || []).forEach(function (row) {
            if (canAccessReceipt(row)) store.delete(row.id);
          });
        }
        var imported = 0;
        payload.receipts.forEach(function (src) {
          if (!src || !src.id || !src.number) return;
          var r = Object.assign({}, src);
          var present = byId[r.id];
          if (uid) {
            if (present && !canAccessReceipt(present)) {
              r.id = newRecordId();
            }
            r.userId = uid;
          } else {
            if (r.userId) return;
            if (present && !canAccessReceipt(present)) return;
            r.userId = null;
          }
          r.syncStatus = r.syncStatus || "pending";
          store.put(r);
          byId[r.id] = r;
          imported += 1;
        });
        var meta = tx.objectStore("meta");
        if (payload.sequence != null) {
          meta.get(sequenceKey()).onsuccess = function (ev) {
            var cur = ev.target.result && ev.target.result.value;
            var incoming = Number(payload.sequence) || 0;
            var next = Math.max(Number(cur) || 0, incoming);
            meta.put({ key: sequenceKey(), value: next });
          };
        }
        if (payload.business) {
          var biz = Object.assign({}, emptyBusiness(), payload.business);
          biz.syncStatus = "pending";
          biz.updatedAt = new Date().toISOString();
          meta.put({ key: businessMetaKey(), value: biz });
        }
        return new Promise(function (resolve, reject) {
          tx.oncomplete = function () { resolve(imported); };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    });
  }

  global.ReceiptlyStorage = {
    openDb: openDb,
    nextNumber: nextNumber,
    peekNumber: peekNumber,
    formatNumber: formatNumber,
    parseSeqFromNumber: parseSeqFromNumber,
    catchUpSequence: catchUpSequence,
    getBusiness: getBusiness,
    saveBusiness: saveBusiness,
    putBusinessSynced: putBusinessSynced,
    emptyBusiness: emptyBusiness,
    businessFilled: businessFilled,
    adoptGuestBusinessIfNeeded: adoptGuestBusinessIfNeeded,
    adoptGuestReceiptsIfNewAccount: adoptGuestReceiptsIfNewAccount,
    getMeta: getMeta,
    setMeta: setMeta,
    saveReceipt: saveReceipt,
    putReceiptSynced: putReceiptSynced,
    getReceipt: getReceipt,
    getReceiptByNumber: getReceiptByNumber,
    getReceipts: getReceipts,
    getVisibleReceipts: getVisibleReceipts,
    listUnownedReceipts: listUnownedReceipts,
    getTrashedReceipts: getTrashedReceipts,
    listPendingReceipts: listPendingReceipts,
    listTombstones: listTombstones,
    clearTombstone: clearTombstone,
    addTombstone: addTombstone,
    trashReceipt: trashReceipt,
    restoreReceipt: restoreReceipt,
    purgeReceipt: purgeReceipt,
    purgeOwnedBy: purgeOwnedBy,
    purgeExpiredTrash: purgeExpiredTrash,
    trashAgeDays: trashAgeDays,
    TRASH_DAYS: TRASH_DAYS,
    deleteReceipt: deleteReceipt,
    clearReceipts: clearReceipts,
    exportAll: exportAll,
    importAll: importAll
  };
})(window);
