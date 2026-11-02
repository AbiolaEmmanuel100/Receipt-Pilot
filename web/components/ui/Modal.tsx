"use client";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { cx } from "./cx";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: bottom sheet on phones, centred card on larger screens.
 * Focus is trapped while open and returned to the opener on close.
 */
export function Modal({ open, onClose, title, description, children, footer, dismissible = true, size = "md", labelledBy, hideTitle }: {
  open: boolean; onClose?: () => void; title?: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode;
  dismissible?: boolean; size?: "sm" | "md" | "lg" | "xl"; labelledBy?: string; hideTitle?: boolean;
}) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    const t = setTimeout(() => {
      const el = panel.current;
      if (!el) return;
      const auto = el.querySelector<HTMLElement>("[data-autofocus]") || el.querySelector<HTMLElement>(FOCUSABLE);
      (auto || el).focus();
    }, 30);
    return () => {
      clearTimeout(t);
      html.style.overflow = prev;
      const o = opener.current as HTMLElement | null;
      if (o && typeof o.focus === "function" && o.isConnected) o.focus();
    };
  }, [open]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape" && dismissible && onClose) { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  const widths = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-xl", xl: "sm:max-w-3xl" };
  const sheet = reduce ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 32 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 24 } };

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" onKeyDown={onKey}>
          <m.div className="absolute inset-0 bg-navy/55 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }} onClick={() => dismissible && onClose && onClose()} aria-hidden="true" />
          <m.div ref={panel} role="dialog" aria-modal="true" aria-labelledby={labelledBy || (title ? titleId : undefined)} tabIndex={-1}
            {...sheet} transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
            className={cx("relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-lift outline-none sm:rounded-3xl", widths[size])}>
            <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" aria-hidden="true" />
            {(title || (dismissible && onClose)) ? (
              <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-1 pt-3 sm:px-6 sm:pt-5">
                <div className={cx("min-w-0", hideTitle && "sr-only")}>
                  {title ? <h2 id={titleId} className="text-xl font-bold leading-tight text-ink">{title}</h2> : null}
                  {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
                </div>
                {dismissible && onClose ? (
                  <button type="button" onClick={onClose} aria-label="Close" className="press -mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-slate-100 hover:text-ink">
                    <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden="true"><path d="M5.7 4.3 10 8.6l4.3-4.3 1.4 1.4-4.3 4.3 4.3 4.3-1.4 1.4-4.3-4.3-4.3 4.3-1.4-1.4 4.3-4.3-4.3-4.3z" /></svg>
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2 sm:px-6 sm:pb-6">{children}</div>
            {footer ? <div className="safe-bottom shrink-0 border-t border-line bg-white px-5 py-3 sm:rounded-b-3xl sm:px-6">{footer}</div> : null}
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
