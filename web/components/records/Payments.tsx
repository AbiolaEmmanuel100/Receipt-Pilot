"use client";
import { useEffect, useState } from "react";
import { money } from "@/lib/calc";
import { MAX_NOTE, canRecordPayment, issuePaid, outstanding, parseAmount, paymentsOf, todayIso, validatePayment } from "@/lib/payments";
import type { PaymentInput } from "@/lib/payments";
import type { Receipt } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import { IconCash, IconUndo } from "@/components/ui/Icons";

export const PAY_METHODS = ["Cash", "Bank Transfer", "Card", "POS", "Mobile Payment", "Other"];

/** Balance card + payment trail shown above the receipt in the preview. */
export function PaymentPanel({ r, onRecord, onUndo }: { r: Receipt; onRecord: () => void; onUndo: () => void }) {
  const cur = r.currency || "NGN";
  const pays = paymentsOf(r);
  const owing = canRecordPayment(r);
  if (!owing && !pays.length) return null;
  const bal = outstanding(r);
  const opening = issuePaid(r);
  const cleared = !owing && pays.length > 0 && !r.voided && !r.refunded;
  return (
    <section aria-labelledby="payPanelTitle" id="paymentPanel" className={cx("rounded-2xl border p-4", cleared ? "border-ok/30 bg-ok-bg/50" : "border-warn/30 bg-warn-bg/50")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="payPanelTitle" className="text-sm font-semibold text-muted">{cleared ? "Paid in full" : "Balance due"}</h3>
          <p className="tabular text-2xl font-bold leading-tight" id="payPanelBalance">{cleared ? money(r.grand, cur) : money(bal, cur)}</p>
          <p className="tabular text-sm text-muted">
            {cleared ? (r.paidInFullOn ? "Cleared on " + r.paidInFullOn : "Cleared") : "Paid " + money(r.paid, cur) + " of " + money(r.grand, cur)}
          </p>
        </div>
        {owing ? <Button onClick={onRecord} id="recordPaymentBtn"><IconCash className="size-5" />Record payment</Button> : null}
      </div>
      {pays.length ? (
        <div className="mt-3">
          <p className="mb-1 text-sm font-semibold text-ink">Payment history</p>
          <ul className="divide-y divide-line/70 rounded-xl bg-white ring-1 ring-line" id="paymentList">
            {opening > 0 ? (
              <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0"><span className="tabular block font-semibold">{r.date || "—"}</span><span className="block text-muted">Paid when issued{r.payment ? " · " + r.payment : ""}</span></span>
                <span className="tabular shrink-0 font-semibold">{money(opening, cur)}</span>
              </li>
            ) : null}
            {pays.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0"><span className="tabular block font-semibold">{p.date}</span><span className="block break-words text-muted">{p.method || "Payment"}{p.note ? " · " + p.note : ""}</span></span>
                <span className="tabular shrink-0 font-semibold">{money(p.amount, cur)}</span>
              </li>
            ))}
          </ul>
          {!r.voided && !r.refunded ? (
            <Button variant="ghost" size="sm" className="mt-2" onClick={onUndo} id="undoPaymentBtn"><IconUndo className="size-4" />Undo last payment</Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Bottom sheet (phone) / dialog (desktop) to record a payment against the balance. */
export function RecordPaymentSheet({ r, open, onClose, onSave }: { r: Receipt | null; open: boolean; onClose: () => void; onSave: (input: PaymentInput) => Promise<void> }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState("Cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && r) { setAmount(""); setDate(todayIso()); setMethod(r.payment && PAY_METHODS.includes(r.payment) ? r.payment : "Cash"); setNote(""); setError(""); setBusy(false); }
  }, [open, r]);
  if (!r) return null;
  const cur = r.currency || "NGN";
  const bal = outstanding(r);
  const amt = parseAmount(amount);
  const after = isFinite(amt) ? Math.max(0, Math.round((bal - amt) * 100) / 100) : bal;
  const over = isFinite(amt) && Math.round(amt * 100) > Math.round(bal * 100);
  const input = { amount, date, method, note };

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (busy || !r) return;
    const msg = validatePayment(r, input);
    if (msg) { setError(msg); return; }
    setBusy(true);
    try { await onSave(input); } catch (err) { setError((err as Error).message || "Could not record this payment."); setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record payment" description={(r.number || "") + " · " + ((r.customer && r.customer.name) || "Walk-in customer")} size="md"
      footer={<Button block size="lg" onClick={() => submit()} busy={busy} id="savePaymentBtn">{busy ? "Saving…" : "Save payment"}</Button>}>
      <form onSubmit={submit} className="space-y-4" noValidate id="recordPaymentForm">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-bg p-3 text-sm">
          <div><p className="text-muted">Balance now</p><p className="tabular text-lg font-bold" id="sheetBalance">{money(bal, cur)}</p></div>
          <div><p className="text-muted">After this payment</p><p className={cx("tabular text-lg font-bold", after === 0 && !over && isFinite(amt) && amt > 0 ? "text-ok" : "")} id="sheetAfter">{over ? "—" : money(after, cur)}</p></div>
        </div>
        <Field label={"Amount received (" + cur + ")"} id="payAmount" error={error || (over ? "That's more than the balance of " + money(bal, cur) + "." : undefined)}>
          <Input id="payAmount" data-autofocus inputMode="decimal" autoComplete="off" placeholder="0.00" className="tabular text-lg" value={amount}
            aria-invalid={!!error || over} onChange={(e) => { setAmount(e.target.value); setError(""); }} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="button" id="payFull" onClick={() => { setAmount(String(bal)); setError(""); }} className="press min-h-11 rounded-full border border-line bg-white px-4 text-sm font-semibold hover:border-brand">
            Full balance {money(bal, cur)}
          </button>
          {bal >= 2 ? (
            <button type="button" id="payHalf" onClick={() => { setAmount(String(Math.round(bal * 50) / 100)); setError(""); }} className="press min-h-11 rounded-full border border-line bg-white px-4 text-sm font-semibold hover:border-brand">Half</button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date received" id="payDate"><Input id="payDate" type="date" max={todayIso()} value={date} onChange={(e) => { setDate(e.target.value); setError(""); }} /></Field>
          <Field label="Method" id="payMethod">
            <Select id="payMethod" value={method} onChange={(e) => setMethod(e.target.value)}>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</Select>
          </Field>
        </div>
        <Field label={<>Note <span className="font-normal text-muted">(optional)</span></>} id="payNote">
          <Input id="payNote" maxLength={MAX_NOTE} placeholder="e.g. second instalment" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="text-sm text-muted">The payment is added to this receipt's history. If you make a mistake, use <strong>Undo last payment</strong>.</p>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

export function OwingTag({ r }: { r: Receipt }) {
  return <Badge tone="warn">Owes {money(outstanding(r), r.currency || "NGN")}</Badge>;
}
