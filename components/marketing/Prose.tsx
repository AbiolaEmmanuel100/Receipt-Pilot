import type { ReactNode } from "react";

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <article className="rounded-3xl border border-line bg-white p-6 shadow-soft sm:p-10 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_p]:mt-3 [&_p]:text-[17px] [&_p]:leading-relaxed [&_p]:text-slate-700 [&_a]:font-semibold [&_a]:text-brand">
        {children}
      </article>
    </div>
  );
}
