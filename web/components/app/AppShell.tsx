"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LazyMotion, domAnimation, MotionConfig, m } from "framer-motion";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { initAccount, openAccountOrLogin } from "@/lib/account";
import { AUTH_EVENT, ready, userId } from "@/lib/session";
import { installGlobalHandlers } from "@/lib/errors";
import * as U from "@/lib/usage";
import { autoResume } from "@/lib/billing";
import { useSessionUser } from "@/lib/useSession";
import { Wordmark } from "@/components/ui/Logo";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import { IconBell, IconCard, IconChart, IconChevron, IconGrid, IconHome, IconInfo, IconPlus, IconReceipt, IconUser, IconUsers } from "@/components/ui/Icons";
import { Toasts } from "./Toasts";
import { ConfirmHost } from "./ConfirmHost";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { ShareSheet } from "./ShareSheet";
import { AccessGate, ClaimDialog, Paywall, PlanNotice, SyncChip, UsageGate } from "./AccessLayer";
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
  // Not on /signin itself (the page already is the sign-in form).
  ready.then(() => {
    if (userId() || location.pathname.startsWith("/signin")) return;
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

type Item = { href: string; label: string; long: string; icon: (p: { className?: string }) => ReactNode; match?: string[] };
const HOME: Item = { href: "/app", label: "Home", long: "Home", icon: IconHome };
const NEW: Item = { href: "/new", label: "New", long: "New receipt", icon: IconPlus };
const HISTORY: Item = { href: "/records", label: "History", long: "Receipt history", icon: IconReceipt };
const SALES: Item = { href: "/sales", label: "Sales", long: "Sales records", icon: IconChart };
const CUSTOMERS: Item = { href: "/customers", label: "Customers", long: "Customers", icon: IconUsers };
const BILLING: Item = { href: "/billing", label: "Billing", long: "Plan & billing", icon: IconCard };
const NOTIFS: Item = { href: "/notifications", label: "Notifications", long: "Notifications", icon: IconBell };
const SIDEBAR = [HOME, NEW, HISTORY, SALES, CUSTOMERS, BILLING, NOTIFS];
const TABS = [HOME, NEW, HISTORY, SALES];
const MORE_PATHS = ["/customers", "/billing", "/notifications"];

function isActive(path: string, href: string) {
  return path === href || path === href + ".html" || path.startsWith(href + "/");
}

/**
 * App frame: sidebar on desktop (lg+), top bar + thumb-reach tab bar on
 * phones/tablets, plus the shared overlays (auth, share, paywall, toasts...).
 * `access={false}` (billing page) skips account/usage boot, exactly like the
 * old billing.html which loaded neither account.js nor usage.js.
 * `nav={false}` (sign-in page) shows only the top bar.
 */
export function AppShell({ children, access = true, nav = true }: { children: ReactNode; access?: boolean; nav?: boolean }) {
  const path = usePathname() || "";
  const { user } = useSessionUser();
  const [more, setMore] = useState(false);
  useEffect(() => { boot({ access }); }, [access]);
  useEffect(() => { setMore(false); }, [path]);
  const name = user ? (user.businessName || user.email || "").trim() : "";
  const initial = name ? name.charAt(0).toUpperCase() : "";
  const account = () => { setMore(false); if (access) openAccountOrLogin(); else location.href = "/app"; };
  const moreOn = MORE_PATHS.some((p) => isActive(path, p));

  const accountButton = (
    <button type="button" onClick={account} className="press inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white pl-1.5 pr-3 text-sm font-semibold hover:border-brand">
      <span className={cx("flex size-8 items-center justify-center rounded-full text-sm font-bold", user ? "bg-brand text-white" : "bg-slate-100 text-slate-500")} aria-hidden="true">
        {user ? initial || <IconUser className="size-4" /> : <IconUser className="size-4" />}
      </span>
      <span>{user || !access ? "Account" : "Sign in"}</span>
    </button>
  );

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lift">Skip to content</a>
        <div className={cx(nav && "lg:grid lg:grid-cols-[256px_minmax(0,1fr)]")}>
          {nav ? (
            <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-white lg:flex print:hidden" aria-label="App">
              <div className="flex h-16 items-center px-5"><Link href={user ? "/app" : "/"} className="rounded-lg"><Wordmark /></Link></div>
              <div className="px-4 pb-3">
                <Link href="/new" className="press flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[15px] font-semibold text-white shadow-soft hover:bg-brand-dark"><IconPlus className="size-5" />Create receipt</Link>
              </div>
              <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3">
                <ul className="space-y-1">
                  {SIDEBAR.map((n) => {
                    const on = isActive(path, n.href);
                    const Icon = n.icon;
                    return (
                      <li key={n.href}>
                        <Link href={n.href} aria-current={on ? "page" : undefined}
                          className={cx("relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors", on ? "bg-brand-50 text-brand-deep" : "text-slate-600 hover:bg-slate-100 hover:text-ink")}>
                          {on ? <m.span layoutId="side-active" className="absolute inset-y-2 left-0 w-1 rounded-full bg-brand" aria-hidden="true" /> : null}
                          <Icon className="size-5" />{n.long}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
              <div className="border-t border-line p-3">
                <button type="button" onClick={account} className="press flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-slate-100">
                  <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", user ? "bg-brand text-white" : "bg-slate-100 text-slate-500")} aria-hidden="true">{user && initial ? initial : <IconUser className="size-4" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{user ? (user.businessName || "Account") : access ? "Sign in" : "Account"}</span>
                    {user ? <span className="block truncate text-sm text-muted">{user.email}</span> : null}
                  </span>
                  <IconChevron className="size-4 text-slate-400" />
                </button>
              </div>
            </aside>
          ) : null}

          <div className="min-w-0">
            <header className={cx("sticky top-0 z-40 border-b border-line/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75 print:hidden", nav && "lg:hidden")}>
              <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:h-16">
                <Link href={user ? "/app" : "/"} className="rounded-lg"><Wordmark /></Link>
                {nav ? accountButton : null}
              </div>
            </header>
            <InstallBanner />
            <main id="main" className={cx("mx-auto w-full max-w-6xl px-4 pt-4 md:pt-8", nav ? "pb-[calc(96px+env(safe-area-inset-bottom))] lg:px-8 lg:pb-16" : "pb-16")}>
              <m.div key={path} initial={{ y: 6 }} animate={{ y: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>{children}</m.div>
            </main>
          </div>
        </div>

        {nav ? (
          <nav aria-label="Primary" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur lg:hidden print:hidden">
            <ul className="mx-auto grid max-w-lg grid-cols-5">
              {TABS.map((n) => {
                const on = isActive(path, n.href);
                const Icon = n.icon;
                return (
                  <li key={n.href}>
                    <Link href={n.href} aria-current={on ? "page" : undefined} className={cx("flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[12px] font-semibold", on ? "text-brand-deep" : "text-slate-600")}>
                      <span className="relative flex h-7 w-12 items-center justify-center">
                        {on ? <m.span layoutId="tab-active" className="absolute inset-0 rounded-full bg-brand-light" transition={{ type: "spring", stiffness: 500, damping: 40 }} aria-hidden="true" /> : null}
                        <Icon className="relative size-5" />
                      </span>
                      {n.label}
                    </Link>
                  </li>
                );
              })}
              <li>
                <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more} className={cx("flex min-h-[60px] w-full flex-col items-center justify-center gap-0.5 text-[12px] font-semibold", moreOn ? "text-brand-deep" : "text-slate-600")}>
                  <span className="relative flex h-7 w-12 items-center justify-center">
                    {moreOn ? <m.span layoutId="tab-active" className="absolute inset-0 rounded-full bg-brand-light" aria-hidden="true" /> : null}
                    <IconGrid className="relative size-5" />
                  </span>
                  More
                </button>
              </li>
            </ul>
          </nav>
        ) : null}

        {nav ? (
          <Modal open={more} onClose={() => setMore(false)} title="More" size="sm">
            <ul className="-mx-1 space-y-1">
              {[
                { href: "/customers", label: "Customers", icon: IconUsers },
                { href: "/billing", label: "Plan & billing", icon: IconCard },
                { href: "/notifications", label: "Notification settings", icon: IconBell },
                { href: "/about", label: "About Receipt Pilot", icon: IconInfo, plain: true },
              ].map((it) => {
                const Icon = it.icon;
                const cls = "flex min-h-12 items-center gap-3 rounded-xl px-3 text-[16px] font-semibold hover:bg-slate-100";
                return (
                  <li key={it.href}>
                    {it.plain ? <a href={it.href} className={cls}><Icon className="size-5 text-brand" />{it.label}</a>
                      : <Link href={it.href} className={cls} aria-current={isActive(path, it.href) ? "page" : undefined}><Icon className="size-5 text-brand" />{it.label}</Link>}
                  </li>
                );
              })}
              <li>
                <button type="button" onClick={account} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[16px] font-semibold hover:bg-slate-100">
                  <IconUser className="size-5 text-brand" />{user ? "Account" : access ? "Sign in" : "Account"}
                </button>
              </li>
            </ul>
            <p className="mt-4 text-center text-sm text-muted"><a className="underline" href="/privacy-policy">Privacy</a> · <a className="underline" href="/terms">Terms</a></p>
          </Modal>
        ) : null}

        {access ? <><AuthDialog /><UsageGate /><Paywall /><ClaimDialog /><SyncChip /><ShareSheet /></> : null}
        <ConfirmHost />
        {access && nav ? <><AccessGate /><PlanNotice /></> : null}
        <Toasts />
      </MotionConfig>
    </LazyMotion>
  );
}
