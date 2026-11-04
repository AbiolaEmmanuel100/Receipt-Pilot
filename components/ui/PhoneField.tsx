"use client";
import { useMemo } from "react";
import { COUNTRIES, analyze, countryByIso, shortLabel } from "@/lib/phone";
import { controlClass, Label } from "./Field";
import { cx } from "./cx";

/** Country code picker + number input (replaces the phone.js DOM widget). */
export function PhoneField({ id, label, value, iso, onChange }: { id: string; label: string; value: string; iso: string; onChange: (value: string, iso: string) => void }) {
  const info = useMemo(() => analyze(value, iso), [value, iso]);
  const c = countryByIso(iso);
  const showMsg = value && info.message && !info.valid;
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        {/* Fixed-width picker: the long country names live only in the native option list, so they can
            never widen the field; the number input takes the rest (flex-1, min-w-0). */}
        <div className="relative w-[6.25rem] shrink-0 sm:w-[6.75rem]">
          <select aria-label={label + " country code"} value={iso} onChange={(e) => onChange(value, e.target.value)}
            className={cx(controlClass, "!w-full min-w-0 appearance-none truncate pr-7 text-[15px] text-transparent [&>option]:text-ink")}>
            <option value="">Code</option>
            {COUNTRIES.map((k) => <option key={k.iso} value={k.iso}>{k.name} (+{k.dial})</option>)}
          </select>
          <span className="pointer-events-none absolute inset-y-0 left-3 right-7 flex items-center overflow-hidden whitespace-nowrap text-[15px] text-ink" aria-hidden="true">{c ? shortLabel(c) : "Code"}</span>
          <svg className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" /></svg>
        </div>
        <input id={id} type="tel" inputMode="tel" autoComplete="tel" value={value} onChange={(e) => onChange(e.target.value, iso)}
          aria-describedby={showMsg ? id + "-msg" : undefined} className={cx(controlClass, "!w-auto min-w-0 flex-1")} placeholder={c ? "e.g. 801 234 5678" : "+234 801 234 5678"} />
      </div>
      {showMsg ? <p id={id + "-msg"} className="mt-1 text-sm text-muted">{info.message}</p> : null}
    </div>
  );
}
