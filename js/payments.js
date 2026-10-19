(function () {
  "use strict";

  var statusEl = document.getElementById("paymentStatus");
  var paymentReceipt = document.getElementById("paymentReceipt");
  var refundReceipt = document.getElementById("refundReceipt");
  var saving = false;

  function money(value) {
    return "₦" + Number(value || 0).toFixed(2);
  }

  async function load() {
    if (!window.ReceiptlyAccount || !ReceiptlyAccount.userId || !ReceiptlyAccount.userId()) {
      statusEl.textContent = "Sign in to record payments against your receipts.";
      return;
    }
    var sb = await ReceiptlyCloud.ready();
    var res = await sb.from("receipts").select("id,receipt_number,outstanding").is("deleted_at", null);
    if (res.error) throw res.error;
    paymentReceipt.textContent = "";
    refundReceipt.textContent = "";
    (res.data || []).forEach(function (row) {
      var refundOption = document.createElement("option");
      refundOption.value = row.id;
      refundOption.textContent = row.receipt_number;
      refundReceipt.appendChild(refundOption);
      if (Number(row.outstanding) > 0) {
        var option = document.createElement("option");
        option.value = row.id;
        option.textContent = row.receipt_number + " · outstanding " + money(row.outstanding);
        paymentReceipt.appendChild(option);
      }
    });
    statusEl.textContent = "Loaded your receipts. Payments are saved only after Supabase confirms them.";
  }

  document.getElementById("paymentForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (saving) return;
    saving = true;
    var error = document.getElementById("paymentError");
    error.textContent = "";
    try {
      var sb = await ReceiptlyCloud.ready();
      var res = await sb.rpc("apply_receipt_payment", {
        p_receipt_id: paymentReceipt.value,
        p_amount: Number(document.getElementById("paymentAmount").value),
        p_method: document.getElementById("paymentMethod").value,
        p_paid_on: document.getElementById("paymentDate").value,
        p_reference: document.getElementById("paymentReference").value.trim(),
        p_notes: document.getElementById("paymentNotes").value.trim(),
        p_idempotency_key: "pay-" + Date.now() + "-" + Math.random().toString(16).slice(2)
      });
      if (res.error) throw res.error;
      statusEl.textContent = "Payment saved to your account.";
      await load();
    } catch (err) {
      error.textContent = String((err && err.message) || "Unable to save that payment.");
    } finally {
      saving = false;
    }
  });

  document.getElementById("refundForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (saving) return;
    saving = true;
    var error = document.getElementById("refundError");
    error.textContent = "";
    try {
      var sb = await ReceiptlyCloud.ready();
      var res = await sb.rpc("record_refund", {
        p_receipt_id: refundReceipt.value || null,
        p_amount: Number(document.getElementById("refundAmount").value),
        p_status: document.getElementById("refundStatus").value,
        p_reason: document.getElementById("refundReason").value.trim(),
        p_refunded_on: document.getElementById("refundDate").value,
        p_idempotency_key: "refund-" + Date.now() + "-" + Math.random().toString(16).slice(2)
      });
      if (res.error) throw res.error;
      statusEl.textContent = "Refund recorded. The receipt balance was not changed.";
    } catch (err) {
      error.textContent = String((err && err.message) || "Unable to save that refund.");
    } finally {
      saving = false;
    }
  });

  async function start() {
    if (window.ReceiptlyAccount && ReceiptlyAccount.ready) await ReceiptlyAccount.ready;
    var today = new Date().toISOString().slice(0, 10);
    document.getElementById("paymentDate").value = today;
    document.getElementById("refundDate").value = today;
    await load();
  }

  start().catch(function () { statusEl.textContent = "Unable to load receipts."; });
})();
