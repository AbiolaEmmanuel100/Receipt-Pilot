"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ready, userId } from "@/lib/session";
import { useSessionUser } from "@/lib/useSession";

function toSignIn() {
  const here = location.pathname + location.search + location.hash;
  location.replace("/signin?next=" + encodeURIComponent(here));
}

/**
 * App pages (dashboard, history, sales, customers) need an account. Waits for
 * the stored Supabase session to be read (works offline), then either shows
 * the page or sends the visitor to /signin?next=<this page>.
 */
export function RequireAuth({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { user } = useSessionUser();
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let on = true;
    ready.then(() => {
      if (!on) return;
      if (userId()) setChecked(true);
      else toSignIn();
    });
    return () => { on = false; };
  }, []);
  // Signed out while on the page (log out, session revoked): back to sign-in.
  useEffect(() => { if (checked && !user) toSignIn(); }, [checked, user]);
  if (!checked || !user) return <>{fallback ?? <PageSkeleton />}</>;
  return <>{children}</>;
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <div className="skeleton h-8 w-48 rounded-lg" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
      </div>
      <div className="skeleton h-64 rounded-2xl" />
    </div>
  );
}
