(function (global) {
  "use strict";

  async function download(el, filename) {
    if (!window.html2canvas || !window.jspdf) {
      throw new Error("pdf-lib");
    }
    var canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false
    });
    var img = canvas.toDataURL("image/png");
    var jsPDF = window.jspdf.jsPDF;
    var pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    var pageW = pdf.internal.pageSize.getWidth();
    var pageH = pdf.internal.pageSize.getHeight();
    var marginX = 14;
    var marginY = 12;
    var maxW = pageW - marginX * 2;
    var maxH = pageH - marginY * 2;
    var mmW = canvas.width * 0.264583 / 2;
    var mmH = canvas.height * 0.264583 / 2;
    var scale = maxW / mmW;
    if (mmH * scale > maxH) scale = maxH / mmH;
    var w = mmW * scale;
    var h = mmH * scale;
    var x = (pageW - w) / 2;
    var y = marginY;
    pdf.addImage(img, "PNG", x, y, w, h);
    pdf.save((filename || "receipt").replace(/[^\w.-]+/g, "_") + ".pdf");
  }

  global.ReceiptlyPdf = { download: download };
})(window);
