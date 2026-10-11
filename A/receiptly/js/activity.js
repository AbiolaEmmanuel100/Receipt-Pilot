(function (global) {
  "use strict";

  async function log(action, extra) {
    if (!global.ReceiptlyStorage) return;
    var list = await ReceiptlyStorage.getMeta("activity", []);
    if (!Array.isArray(list)) list = [];
    list.unshift({
      at: new Date().toISOString(),
      action: String(action || ""),
      number: extra && extra.number ? String(extra.number) : "",
      userId: (global.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId()) || ""
    });
    await ReceiptlyStorage.setMeta("activity", list.slice(0, 80));
  }

  function list() {
    return ReceiptlyStorage.getMeta("activity", []).then(function (rows) {
      rows = Array.isArray(rows) ? rows : [];
      var uid = (global.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId()) || "";
      if (!uid) return rows.filter(function (r) { return !r.userId; });
      return rows.filter(function (r) { return r.userId === uid; });
    });
  }

  global.ReceiptlyActivity = { log: log, list: list };
})(window);
