import Link from "next/link";
import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type Variant = "primary" | "secondary" | "ghost" | "danger" | "navy" | "link";
export type Size = "sm" | "md" | "lg";

const base = "press inline-flex items-center justify-center gap-2 rounded-[11px] font-semibold tracking-[-0.01em] select-none text-center disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-[0_1px_2px_rgba(16,24,40,0.12),inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-brand-dark",
  secondary: "bg-white text-ink border border-line shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:bg-slate-50 hover:border-slate-300",
  ghost: "bg-transparent text-ink hover:bg-slate-100",
  danger: "bg-danger text-white hover:bg-red-800",
  navy: "bg-navy text-white hover:bg-navy-2",
  link: "bg-transparent text-brand underline-offset-4 hover:underline px-1",
};
const sizes: Record<Size, string> = {
  sm: "min-h-11 px-3 text-sm",
  md: "min-h-11 px-4 text-[15px]",
  lg: "min-h-12 px-6 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(base, variants[variant], variant === "link" ? "min-h-11 text-[15px]" : sizes[size], extra);
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; busy?: boolean; icon?: ReactNode; block?: boolean };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", busy, icon, block, className, children, type = "button", disabled, ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || busy} aria-busy={busy || undefined}
      className={buttonClass(variant, size, cx(block && "w-full", className))} {...rest}>
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ href, variant = "primary", size = "md", className, children, block, ...rest }:
  { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode; block?: boolean } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const cls = buttonClass(variant, size, cx(block && "w-full", className));
  if (/^(https?:|mailto:|tel:)/.test(href) || /\.html/.test(href)) return <a href={href} className={cls} {...rest}>{children}</a>;
  return <Link href={href} className={cls} {...rest}>{children}</Link>;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("size-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
