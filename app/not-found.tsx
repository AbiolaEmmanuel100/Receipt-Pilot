import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import { buttonClass } from "@/components/ui/Button";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
        <p className="text-6xl font-bold tracking-tight text-brand">404</p>
        <h1 className="mt-3 text-[1.625rem] font-bold tracking-tight">Page not found</h1>
        <p className="mt-2 text-muted">That address is not a page on Receipt Pilot.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link prefetch={false} href="/new" className={buttonClass("primary")}>Receipt Generator</Link>
          <Link prefetch={false} href="/records" className={buttonClass("secondary")}>Receipt Records</Link>
          <Link prefetch={false} href="/" className={buttonClass("ghost")}>Home</Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
