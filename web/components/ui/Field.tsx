"use client";
import { forwardRef, useId, useState } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

export const inputClass = "block w-full min-h-11 rounded-[11px] border border-line bg-white px-3.5 py-2.5 text-ink placeholder:text-slate-400 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[border-color,box-shadow] focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/20 disabled:bg-slate-50 disabled:text-slate-500 [&:is(input,textarea):read-only]:bg-slate-50";

/** Single-line controls (inputs, selects, the phone pair) share one exact height so rows line up. */
export const controlClass = inputClass + " h-11 py-0";

export function Label({ htmlFor, children, className }: { htmlFor?: string; children: ReactNode; className?: string }) {
  return <label htmlFor={htmlFor} className={cx("mb-1.5 block text-sm font-medium text-ink", className)}>{children}</label>;
}

export function Field({ label, hint, error, children, id, className }: { label?: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; id?: string; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      {children}
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
      {error ? <p className="mt-1 text-sm font-semibold text-danger" role="alert">{error}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(controlClass, className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cx(controlClass, "appearance-none pr-10", className)} {...rest}>{children}</select>
      <svg className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" /></svg>
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(inputClass, "min-h-24", className)} {...rest} />;
});

export function PasswordInput({ id, label, autoComplete, value, onChange }: { id: string; label: string; autoComplete: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} id={id}>
      <div className="relative">
        <Input id={id} type={show ? "text" : "password"} minLength={6} required autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} className="pr-20" />
        <button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show} aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-1 top-1/2 min-h-11 -translate-y-1/2 rounded-lg px-3 text-sm font-semibold text-brand hover:bg-brand-50">
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </Field>
  );
}

export function Checkbox({ checked, onChange, children, id }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; id?: string }) {
  const auto = useId();
  const cid = id || auto;
  return (
    <label htmlFor={cid} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-muted">
      <input id={cid} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 rounded accent-brand" />
      <span>{children}</span>
    </label>
  );
}

/** Toggle-chip group (payment method/status, filters). Uses radio semantics. */
export function ChipGroup<T extends string>({ label, value, options, onChange, name, disabled }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; name: string; disabled?: boolean }) {
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-semibold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <label key={o.value} className={cx("press relative inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-[15px] font-semibold",
              on ? "border-brand bg-brand text-white shadow-sm" : "border-line bg-white text-ink hover:border-brand")}>
              <input type="radio" name={name} value={o.value} checked={on} onChange={() => onChange(o.value)} className="sr-only" />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FormMessage({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return error
    ? <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm font-semibold text-danger">{error}</p>
    : <p role="status" className="rounded-xl bg-ok-bg px-3 py-2 text-sm font-semibold text-ok">{ok}</p>;
}
