"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { render } from "@/lib/receipt";
import type { Receipt } from "@/lib/types";

/** Renders the exact legacy receipt markup (same HTML as js/receipt.js). */
export const ReceiptPaper = forwardRef<HTMLDivElement | null, { record: Partial<Receipt>; className?: string; id?: string }>(function ReceiptPaper({ record, id }, ref) {
  const el = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => el.current as HTMLDivElement);
  useEffect(() => {
    if (el.current) render(record, el.current);
  }, [record]);
  return <div ref={el} id={id} className="receipt style-classic" aria-live="polite" />;
});
