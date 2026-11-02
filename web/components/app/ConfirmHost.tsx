"use client";
import { useEffect, useState } from "react";
import { confirmState } from "@/lib/bus";
import { useStore } from "@/lib/useStore";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

export function ConfirmHost() {
  const st = useStore(confirmState);
  const [text, setText] = useState("");
  useEffect(() => { setText(""); }, [st]);
  const o = st ? st.opts : null;
  function done(v: boolean | "extra") {
    if (!st) return;
    confirmState.set(null);
    st.resolve(v);
  }
  const blocked = !!(o && o.requireText && text.trim() !== o.requireText);
  return (
    <Modal open={!!st} onClose={() => done(false)} title={o ? o.title || "Please confirm" : ""} size="sm"
      footer={o ? (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => done(false)} data-autofocus={o.requireText ? undefined : true}>{o.cancelLabel || "Cancel"}</Button>
          {o.extraLabel ? <Button variant={o.extraDanger ? "danger" : "secondary"} onClick={() => done("extra")}>{o.extraLabel}</Button> : null}
          <Button variant={o.danger ? "danger" : "primary"} disabled={blocked} onClick={() => done(true)} >{o.confirmLabel || "Confirm"}</Button>
        </div>
      ) : null}>
      {o ? (
        <div className="space-y-4">
          {o.message ? <p className="text-[15px] text-muted">{o.message}</p> : null}
          {o.requireText ? (
            <Field label={<>Type <strong>{o.requireText}</strong> to confirm</>} id="confirmText">
              <Input id="confirmText" data-autofocus value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCapitalize="characters" />
            </Field>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
