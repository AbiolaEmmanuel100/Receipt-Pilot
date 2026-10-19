(function () {
  "use strict";
  var form = document.getElementById("productForm");
  var error = document.getElementById("productError");
  var empty = document.getElementById("productEmpty");
  var wrap = document.getElementById("productTableWrap");
  var rows = document.getElementById("productRows");
  var items = [];

  function money(value) {
    return "₦" + Number(value).toFixed(2);
  }

  function text(value) {
    return document.createTextNode(value);
  }

  function render() {
    rows.textContent = "";
    empty.hidden = items.length > 0;
    wrap.hidden = items.length === 0;
    items.forEach(function (item) {
      var tr = document.createElement("tr");
      var values = [
        item.name,
        item.sku || "—",
        money(item.price),
        item.cost === null ? "Unknown" : money(item.cost),
        String(item.opening),
        String(item.reorder),
        item.archived ? "Archived" : "Active",
        item.opening <= item.reorder ? "Low stock" : "—"
      ];
      values.forEach(function (value, index) {
        var td = document.createElement("td");
        if (index >= 2 && index <= 5) td.className = "col-num";
        td.appendChild(text(value));
        tr.appendChild(td);
      });
      rows.appendChild(tr);
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var name = document.getElementById("productName").value.trim();
    var openingRaw = document.getElementById("productOpening").value.trim();
    var reorderRaw = document.getElementById("productReorder").value.trim();
    var opening = Number(openingRaw);
    var reorder = Number(reorderRaw);
    var costRaw = document.getElementById("productCost").value.trim();
    var cost = costRaw === "" ? null : Number(costRaw);
    var whole = function (value, raw) {
      return raw !== "" && Number.isFinite(value) && value >= 0 && Math.floor(value) === value;
    };
    if (!name || !Number.isFinite(price) || price < 0 || !whole(opening, openingRaw) || !whole(reorder, reorderRaw) || (cost !== null && (!Number.isFinite(cost) || cost < 0))) {
      error.textContent = "Enter a product name, a non-negative price, and whole-number stock values. Leave cost blank if unknown.";
      return;
    }
    error.textContent = "";
    items.push({
      name: name,
      sku: document.getElementById("productSku").value.trim(),
      price: price,
      cost: cost,
      opening: opening,
      reorder: reorder,
      archived: false
    });
    form.reset();
    render();
  });

  render();
})();
