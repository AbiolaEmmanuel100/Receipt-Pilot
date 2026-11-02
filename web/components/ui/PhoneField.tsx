"use client";
import { useMemo } from "react";
import { COUNTRIES, analyze, countryByIso, shortLabel } from "@/lib/phone";
import { inputClass, Label } from "./Field";
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
        <div className="relative shrink-0">
          <select aria-label={label + " country code"} value={iso} onChange={(e) => onChange(value, e.target.value)}
            className={cx(inputClass, "w-[6.75rem] appearance-none pr-6 text-[15px] text-transparent [&>option]:text-ink")}>
            <option value="">Code</option>
            {COUNTRIES.map((k) => <option key={k.iso} value={k.iso}>{k.name} (+{k.dial})</option>)}
          </select>
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[15px] text-ink" aria-hidden="true">{c ? shortLabel(c) : "Code"}</span>
        </div>
        <input id={id} type="tel" inputMode="tel" autoComplete="tel" value={value} onChange={(e) => onChange(e.target.value, iso)}
          aria-describedby={showMsg ? id + "-msg" : undefined} className={cx(inputClass, "min-w-0 flex-1")} placeholder={c ? "e.g. 801 234 5678" : "+234 801 234 5678"} />
      </div>
      {showMsg ? <p id={id + "-msg"} className="mt-1 text-sm text-muted">{info.message}</p> : null}
    </div>
  );
}
