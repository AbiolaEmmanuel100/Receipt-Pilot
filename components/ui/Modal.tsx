"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { IconClose } from "./Icons";

/**
 * Accessible dialog on Radix Dialog (focus trap, scroll lock, inert
 * background, Escape): bottom sheet on phones, centred card on larger
 * screens. Same props as before; non-dismissible dialogs ignore Escape and
 * outside clicks.
 */
export function Modal({ open, onClose, title, description, children, footer, dismissible = true, size = "md", labelledBy, hideTitle }: {
  open: boolean; onClose?: () => void; title?: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode;
  dismissible?: boolean; size?: "sm" | "md" | "lg" | "xl"; labelledBy?: string; hideTitle?: boolean;
}) {
  const reduce = useReducedMotion();
  const widths = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-xl", xl: "sm:max-w-3xl" };
  const sheet = reduce ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 40 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 28 } };
  const block = (e: Event) => { if (!dismissible) e.preventDefault(); };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o && dismissible && onClose) onClose(); }}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
              <Dialog.Overlay asChild forceMount>
                <m.div className="absolute inset-0 bg-navy/50 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount aria-labelledby={labelledBy} {...(description ? {} : { "aria-describedby": undefined })}
                onEscapeKeyDown={block} onPointerDownOutside={block} onInteractOutside={block}
                onOpenAutoFocus={(e) => {
                  e.preventDefault();
                  const el = e.currentTarget as HTMLElement | null;
                  if (!el) return;
                  // Focus a marked field, else the dialog itself (no stray focus ring on the close button; Tab reaches it next).
                  const auto = el.querySelector<HTMLElement>("[data-autofocus]");
                  (auto || el).focus();
                }}>
                <m.div tabIndex={-1} {...sheet} transition={{ type: "spring", stiffness: 440, damping: 38, mass: 0.8 }}
                  className={cx("relative flex max-h-[92dvh] w-full flex-col rounded-t-[28px] border border-line/70 bg-white shadow-lift outline-none sm:rounded-3xl", widths[size])}>
                  <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" aria-hidden="true" />
                  {(title || (dismissible && onClose)) ? (
                    <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-1 pt-3 sm:px-6 sm:pt-5">
                      <div className={cx("min-w-0", hideTitle && "sr-only")}>
                        <Dialog.Title className="text-xl font-bold leading-tight tracking-tight text-ink">{title || "Dialog"}</Dialog.Title>
                        {description ? <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description> : null}
                      </div>
                      {dismissible && onClose ? (
                        <Dialog.Close aria-label="Close" className="press -mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-slate-100 hover:text-ink">
                          <IconClose className="size-5" />
                        </Dialog.Close>
                      ) : null}
                    </div>
                  ) : <Dialog.Title className="sr-only">Dialog</Dialog.Title>}
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2 sm:px-6 sm:pb-6">{children}</div>
                  {footer ? <div className="safe-bottom shrink-0 border-t border-line bg-white px-5 py-3 sm:rounded-b-3xl sm:px-6">{footer}</div> : null}
                </m.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
