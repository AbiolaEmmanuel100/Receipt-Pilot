import Link from "next/link";
import { Wordmark } from "@/components/ui/Logo";
import { buttonClass } from "@/components/ui/Button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:h-16">
        <Link href="/" aria-label="Receipt Pilot home"><Wordmark /></Link>
        <nav aria-label="Primary" className="flex items-center gap-1">
          <Link href="/#features" className="hidden min-h-11 items-center rounded-xl px-3 text-[15px] font-semibold text-slate-600 hover:text-ink md:inline-flex">Features</Link>
          <Link href="/#pricing" className="hidden min-h-11 items-center rounded-xl px-3 text-[15px] font-semibold text-slate-600 hover:text-ink md:inline-flex">Pricing</Link>
          <Link href="/about" className="hidden min-h-11 items-center rounded-xl px-3 text-[15px] font-semibold text-slate-600 hover:text-ink md:inline-flex">About</Link>
          <Link href="/signin" className="inline-flex min-h-11 items-center rounded-xl px-3 text-[15px] font-semibold text-slate-700 hover:text-ink">Sign in</Link>
          <Link href="/new" className={buttonClass("primary", "sm", "hidden sm:inline-flex")}>Create a receipt</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const link = "inline-flex min-h-11 items-center text-slate-300 hover:text-white";
  return (
    <footer className="bg-navy text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="text-lg font-extrabold text-white">Receipt <span className="text-teal-300">Pilot</span></p>
          <p className="mt-2 max-w-sm text-[15px]">Online receipt maker for small businesses. Create, save and print digital receipts.</p>
          <p className="mt-4 text-sm text-slate-400">&copy; 2026 Receipt Pilot</p>
        </div>
        <nav aria-label="Product" className="flex flex-col">
          <p className="mb-1 text-sm font-bold uppercase tracking-wide text-white">Product</p>
          <Link className={link} href="/new">Receipt generator</Link>
          <Link className={link} href="/records">Receipts</Link>
          <a className={link} href="/sales.html">Sales records</a>
          <a className={link} href="/customers.html">Customers</a>
        </nav>
        <nav aria-label="Company" className="flex flex-col">
          <p className="mb-1 text-sm font-bold uppercase tracking-wide text-white">Company</p>
          <Link className={link} href="/about">About</Link>
          <Link className={link} href="/privacy-policy">Privacy Policy</Link>
          <Link className={link} href="/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
