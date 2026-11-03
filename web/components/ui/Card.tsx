import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("min-w-0 rounded-card border border-line bg-card shadow-soft", className)} {...rest}>{children}</div>;
}

export function Section({ title, description, action, children, className, id }: { title: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <Card className={cx("p-4 sm:p-5", className)} id={id}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold leading-tight">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "danger" | "brand"; children: ReactNode }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    ok: "bg-ok-bg text-[#065f46]",
    warn: "bg-warn-bg text-[#92400e]",
    danger: "bg-danger-bg text-[#991b1b]",
    brand: "bg-brand-light text-brand-deep",
  };
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function statusTone(status?: string): "ok" | "warn" | "danger" {
  if (status === "PAID IN FULL" || status === "PAID") return "ok";
  if (status === "PARTIALLY PAID") return "warn";
  return "danger";
}
