(function (global) {
  "use strict";

  function render(record, target) {
    var s = ReceiptlyVal.sanitize;
    var money = ReceiptlyCalc.money;
    var cur = record.currency || "NGN";
    var biz = record.business || {};
    var cust = record.customer || {};
    var items = record.items || [];
    target.className = "receipt style-" + (record.template || "classic");
    var rawLogo = String(biz.logo || "");
    var safeLogo = "";
    if (/^data:image\//i.test(rawLogo) || /^https:\/\//i.test(rawLogo)) {
      safeLogo = rawLogo;
    }
    target.classList.toggle("hidden-logo", !safeLogo);

    var logo = safeLogo
      ? '<div class="logo-wrap"><img alt="' + s(biz.name || "Business logo") + '" src="' + s(safeLogo) + '"></div>'
      : "";

    var lines = [];
    if (biz.address) lines.push(s(biz.address).replace(/\n/g, "<br>"));
    var row = [biz.phone, biz.email, biz.website].filter(Boolean).map(s);
    if (row.length) lines.push(row.join(" · "));

    var custBits = [];
    if (cust.name) custBits.push(s(cust.name));
    if (cust.phone) custBits.push(s(cust.phone));
    if (cust.email) custBits.push(s(cust.email));

    var rows = items.map(function (it) {
      var tot = it.total != null ? it.total : (Number(it.qty) || 0) * (Number(it.price) || 0);
      return "<tr><td class='col-item'>" + s(it.name || "—") + "</td>" +
        "<td class='col-num'>" + s(it.qty) + "</td>" +
        "<td class='col-num'>" + money(it.price, cur) + "</td>" +
        "<td class='col-num'>" + money(tot, cur) + "</td></tr>";
    }).join("");

    var status = record.status || "UNPAID";
    if (status === "PAID") status = "PAID IN FULL";
    var statusClass = "st-" + status.replace(/\s+/g, "-").toLowerCase();

    var footer = (biz.footer && String(biz.footer).trim()) || "Thank you for your business.";
    var verifyUrl = "";
    if (record.shareToken) {
      var origin = (location.origin && location.origin !== "null") ? location.origin : "";
      var path = location.pathname.replace(/[^/]+$/, "") + "r.html";
      verifyUrl = origin + path + "?t=" + encodeURIComponent(record.shareToken);
    }

    target.innerHTML =
      '<div class="r-brand">' +
        (logo ? logo : "") +
        '<div class="r-brand-text">' +
          '<div class="r-biz">' + s(biz.name || "Your Business") + "</div>" +
          '<div class="r-contact">' + lines.join("<br>") + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="r-banner"><span class="r-title">RECEIPT</span></div>' +
      '<div class="r-info">' +
        '<div><span class="k">Receipt No.</span><span class="v">' + s(record.number || "—") + "</span></div>" +
        '<div><span class="k">Date</span><span class="v">' + s(record.date || "") + (record.time ? " · " + s(record.time) : "") + "</span></div>" +
        (custBits.length ? '<div class="span-2"><span class="k">Customer</span><span class="v">' + custBits.join(" · ") + "</span></div>" : "") +
      "</div>" +
      '<table class="r-table"><thead><tr><th class="col-item">Item</th><th class="col-num">Qty</th><th class="col-num">Price</th><th class="col-num">Total</th></tr></thead><tbody>' +
      (rows || "<tr><td colspan='4'>No items</td></tr>") + "</tbody></table>" +
      '<div class="r-summary">' +
        '<div class="r-paymeta">' +
          "<div><span class='k'>Payment method</span><span>" + s(record.payment || "") + "</span></div>" +
          '<div><span class="k">Payment Status</span><span class="r-status ' + statusClass + '">' + s(status) + "</span></div>" +
          (record.notes ? "<div class='r-notes'><span class='k'>Notes</span><p>" + s(record.notes).replace(/\n/g, "<br>") + "</p></div>" : "") +
        "</div>" +
        '<div class="r-totals">' +
          "<div><span>Subtotal</span><span>" + money(record.subtotal, cur) + "</span></div>" +
          "<div><span>Discount</span><span>" + money(record.discount, cur) + "</span></div>" +
          "<div><span>Tax (" + s(record.taxPct || 0) + "%)</span><span>" + money(record.tax, cur) + "</span></div>" +
          ((Number(record.shipping) || 0) > 0 ? "<div><span>Delivery</span><span>" + money(record.shipping, cur) + "</span></div>" : "") +
          '<div class="grand"><span>Grand Total</span><span>' + money(record.grand, cur) + "</span></div>" +
          "<div><span>Amount Paid</span><span>" + money(record.paid, cur) + "</span></div>" +
          "<div><span>Balance Due</span><span>" + money(record.balance, cur) + "</span></div>" +
        "</div>" +
      "</div>" +
      '<div class="r-foot">' + s(footer) + "</div>" +
      (verifyUrl ? '<div class="r-verify"><img class="r-qr" alt="Verify this receipt" data-qr="' + s(verifyUrl) + '"><p>Scan to verify</p></div>' : "");
    fillQr(target);
  }

  function fillQr(root) {
    var img = root.querySelector("[data-qr]");
    if (!img) return;
    var data = img.getAttribute("data-qr");
    if (!data) return;
    if (window.QRCode && QRCode.toDataURL) {
      QRCode.toDataURL(data, { width: 96, margin: 1, errorCorrectionLevel: "M" }, function (err, url) {
        if (!err && url) img.src = url;
      });
    } else {
      img.src = "https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=" + encodeURIComponent(data);
    }
  }

  global.ReceiptlyReceipt = { render: render };
})(window);
