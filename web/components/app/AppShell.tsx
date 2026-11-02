"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LazyMotion, domAnimation, MotionConfig } from "framer-motion";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { initAccount, openAccountOrLogin } from "@/lib/account";
import { AUTH_EVENT, ready, userId } from "@/lib/session";
import { installGlobalHandlers } from "@/lib/errors";
import * as U from "@/lib/usage";
import { autoResume } from "@/lib/billing";
import { useSessionUser } from "@/lib/useSession";
import { Wordmark } from "@/components/ui/Logo";
import { cx } from "@/components/ui/cx";
import { IconChart, IconPlus, IconReceipt, IconUser, IconUsers, IconCard } from "@/components/ui/Icons";
import { Toasts } from "./Toasts";
import { ConfirmHost } from "./ConfirmHost";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { ShareSheet } from "./ShareSheet";
import { ClaimDialog, Paywall, SyncChip, TrialBanner, UsageGate } from "./AccessLayer";
import { InstallBanner } from "./InstallBanner";

let booted = false;
function boot(opts: { access: boolean }) {
  if (booted) return;
  booted = true;
  installGlobalHandlers();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  if (!opts.access) return;
  U.cleanOldGateKeys();
  const wantsSignIn = /^#signin$/i.test(location.hash) || /[?&]signin=1/.test(location.search);
  initAccount({ wantsSignIn });
  document.addEventListener(AUTH_EVENT, () => { autoResume(); });
  // usage.js boot(): ask a returning guest to sign in once per browser session.
  ready.then(() => {
    if (userId()) return;
    U.initGuestSession();
    if (U.requiresAccount()) {
      try {
        if (!sessionStorage.getItem(U.GATE_SESSION)) {
          sessionStorage.setItem(U.GATE_SESSION, "1");
          U.showGate();
        }
      } catch { U.showGate(); }
    }
  });
}

const NAV = [
  { href: "/new", label: "New", long: "New receipt", icon: IconPlus },
  { href: "/records", label: "Receipts", long: "Receipts", icon: IconReceipt },
  { href: "/sales.html", label: "Sales", long: "Sales", icon: IconChart },
  { href: "/customers.html", label: "Customers", long: "Customers", icon: IconUsers },
];

function NavLink({ href, children, className, active }: { href: string; children: ReactNode; className: string; active: boolean }) {
  const props = { className, "aria-current": active ? ("page" as const) : undefined };
  return href.endsWith(".html") ? <a href={href} {...props}>{children}</a> : <Link href={href} {...props}>{children}</Link>;
}

/**
 * App frame for signed-in style pages: top bar on desktop, thumb-reach tab bar
 * on phones, plus the shared overlays (auth, share, paywall, toasts...).
 * `access={false}` (billing page) skips account/usage boot, exactly like the
 * old billing.html which loaded neither account.js nor usage.js.
 */
export function AppShell({ children, access = true }: { children: ReactNode; access?: boolean }) {
  const path = usePathname() || "";
  const { user } = useSessionUser();
  useEffect(() => { boot({ access }); }, [access]);
  const isActive = (href: string) => path === href || path === href + ".html" || (href === "/records" && path.startsWith("/records"));
  const initial = user ? (user.businessName || user.email || "A").trim().charAt(0).toUpperCase() : "";

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lift">Skip to content</a>
        <header className="sticky top-0 z-40 border-b border-line/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:h-16">
            <Link href="/" className="rounded-lg"><Wordmark /></Link>
            <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
              {NAV.map((n) => (
                <NavLink key={n.href} href={n.href} active={isActive(n.href)}
                  className={cx("inline-flex min-h-11 items-center rounded-xl px-3 text-[15px] font-semibold transition-colors", isActive(n.href) ? "bg-brand-50 text-brand" : "text-slate-600 hover:bg-slate-100 hover:text-ink")}>
                  {n.long}
                </NavLink>
              ))}
              <NavLink href="/billing" active={isActive("/billing")}
                className={cx("inline-flex min-h-11 items-center rounded-xl px-3 text-[15px] font-semibold transition-colors", isActive("/billing") ? "bg-brand-50 text-brand" : "text-slate-600 hover:bg-slate-100 hover:text-ink")}>
                Billing
              </NavLink>
            </nav>
            <div className="flex items-center gap-2">
              {access ? (
                <button type="button" onClick={openAccountOrLogin} className="press inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white pl-1.5 pr-3 text-sm font-semibold hover:border-brand">
                  <span className={cx("flex size-8 items-center justify-center rounded-full text-sm font-bold", user ? "bg-brand text-white" : "bg-slate-100 text-slate-500")} aria-hidden="true">
                    {user ? initial : <IconUser className="size-4" />}
                  </span>
                  <span>{user ? "Account" : "Sign in"}</span>
                </button>
              ) : (
                <Link href="/billing" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-600 md:hidden" aria-current="page"><IconCard className="size-5" />Billing</Link>
              )}
            </div>
          </div>
        </header>
        {access ? <TrialBanner /> : null}
        <InstallBanner />
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-4 md:pb-16 md:pt-8">{children}</main>

        <nav aria-label="Primary" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur md:hidden print:hidden">
          <ul className="mx-auto grid max-w-md grid-cols-5">
            {NAV.map((n) => {
              const on = isActive(n.href);
              const Icon = n.icon;
              return (
                <li key={n.href}>
                  <NavLink href={n.href} active={on} className={cx("flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[12px] font-semibold", on ? "text-brand" : "text-slate-600")}>
                    <span className={cx("flex h-7 w-12 items-center justify-center rounded-full transition-colors", on && "bg-brand-light")}><Icon className="size-5" /></span>
                    {n.label}
                  </NavLink>
                </li>
              );
            })}
            <li>
              {access ? (
                <button type="button" onClick={openAccountOrLogin} className="flex min-h-[60px] w-full flex-col items-center justify-center gap-0.5 text-[12px] font-semibold text-slate-600">
                  <span className="flex h-7 w-12 items-center justify-center rounded-full"><IconUser className="size-5" /></span>
                  {user ? "Account" : "Sign in"}
                </button>
              ) : (
                <Link href="/new?signin=1" className="flex min-h-[60px] w-full flex-col items-center justify-center gap-0.5 text-[12px] font-semibold text-slate-600">
                  <span className="flex h-7 w-12 items-center justify-center rounded-full"><IconUser className="size-5" /></span>
                  Account
                </Link>
              )}
            </li>
          </ul>
        </nav>

        {access ? <><AuthDialog /><UsageGate /><Paywall /><ClaimDialog /><SyncChip /><ShareSheet /></> : null}
        <ConfirmHost />
        <Toasts />
      </MotionConfig>
    </LazyMotion>
  );
}
