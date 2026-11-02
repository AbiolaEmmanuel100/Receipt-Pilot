import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui/Logo";

/** Header-only frame for standalone pages (reset password, shared receipt). */
export function MinimalShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 md:h-16"><Link href="/" aria-label="Receipt Pilot home"><Wordmark /></Link></div>
      </header>
      <main id="main" className={"mx-auto w-full px-4 py-6 md:py-10 " + (wide ? "max-w-3xl" : "max-w-md")}>{children}</main>
    </>
  );
}
