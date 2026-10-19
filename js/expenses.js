(function () {
  "use strict";
  var form = document.getElementById("expenseForm");
  var error = document.getElementById("expenseError");
  var empty = document.getElementById("expenseEmpty");
  var wrap = document.getElementById("expenseTableWrap");
  var rows = document.getElementById("expenseRows");
  var items = [];

  function money(value) {
    return "₦" + Number(value).toFixed(2);
  }

  function text(value) {
    return document.createTextNode(value || "");
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
      rows.appendChild(tr);
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var amountRaw = document.getElementById("expenseAmount").value.trim();
    var amount = Number(amountRaw);
    var category = document.getElementById("expenseCategory").value;
    var description = document.getElementById("expenseDescription").value.trim();
    var date = document.getElementById("expenseDate").value;
    if (!date || !description || !category || !Number.isFinite(amount) || amount <= 0) {
      error.textContent = "Enter a date, description, category, and an amount greater than zero.";
      return;
    }
    error.textContent = "";
    items.push({
      date: date,
      description: description,
      category: category,
      amount: amount,
      method: document.getElementById("expenseMethod").value,
      notes: document.getElementById("expenseNotes").value.trim()
    });
    form.reset();
    render();
  });

  render();
})();
