"use client";
import { AnimatePresence, m } from "framer-motion";
import { toasts } from "@/lib/bus";
import { useStore } from "@/lib/useStore";

export function Toasts() {
  const list = useStore(toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[90] flex flex-col items-center gap-2 px-4 md:bottom-6" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <m.div key={t.id} layout initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
            className={"pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-[15px] font-semibold shadow-lift " + (t.type === "error" ? "bg-danger text-white" : "bg-navy text-white")}>
            {t.text}
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
