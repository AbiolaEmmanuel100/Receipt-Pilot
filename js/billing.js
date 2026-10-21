(function (global) {
  "use strict";

  var CURRENCY = {
    NGN: { symbol: "₦", label: "NGN" },
    USD: { symbol: "$", label: "US Dollar" },
    GBP: { symbol: "£", label: "British Pound" },
    EUR: { symbol: "€", label: "Euro" },
    GHS: { symbol: "GH₵", label: "Ghanaian Cedi" },
    KES: { symbol: "KSh", label: "Kenyan Shilling" }
  };

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function roundMoney(value) {
    return Math.round((num(value) + Number.EPSILON) * 100) / 100;
  }

  function money(n, code) {
    var c = CURRENCY[code] || CURRENCY.NGN;
    var val = num(n);
    var formatted = Math.abs(val).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return (val < 0 ? "-" : "") + c.symbol + formatted;
  }

  function compute(items, discount, taxPct, paid, shipping) {
    var rows = (items || []).map(function (it) {
      var qty = Math.max(0, num(it.qty));
      var price = Math.max(0, num(it.price));
      return { name: it.name || "", qty: qty, price: price, total: roundMoney(qty * price) };
    });
    var subtotal = roundMoney(rows.reduce(function (s, it) { return s + it.total; }, 0));
    var disc = Math.max(0, roundMoney(discount));
    if (disc > subtotal) disc = subtotal;
    var after = roundMoney(subtotal - disc);
    var pct = Math.max(0, num(taxPct));
    var tax = roundMoney(after * (pct / 100));
    var ship = Math.max(0, roundMoney(shipping));
    var grand = roundMoney(after + tax + ship);
    var amountPaid = Math.max(0, roundMoney(paid));
    var balance = Math.max(0, roundMoney(grand - amountPaid));
    var status = "UNPAID";
    if (grand <= 0 && amountPaid <= 0) status = "UNPAID";
    else if (amountPaid + 0.0001 >= grand) status = "PAID";
    else if (amountPaid > 0) status = "PARTIALLY PAID";
    return {
      items: rows,
      subtotal: subtotal,
      discount: disc,
      taxPct: pct,
      tax: tax,
      shipping: ship,
      grand: grand,
      paid: amountPaid,
      balance: balance,
      status: status
    };
  }

  global.ReceiptlyCalc = {
    CURRENCY: CURRENCY,
    num: num,
    money: money,
    compute: compute
  };
})(window);
