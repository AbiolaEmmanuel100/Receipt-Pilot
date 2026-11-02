"use client";
// Native port of admin.html + js/admin.js. Logic kept identical: wait for the
// stored Supabase session (getSession, then the first auth event, then a 2.5 s
// re-check), call rpc("list_account_deletion_requests") and show its rows.
// Who may see rows is decided only by the database function / RLS; this page
// adds no checks of its own and loads no account/billing code.
import { useEffect, useState } from "react";
import { ready as cloudReady } from "@/lib/cloud";
import { Card } from "@/components/ui/Card";
import { cx } from "@/components/ui/cx";

function fmt(ts: any) {
  if (!ts) return "—";
  return String(ts).replace("T", " ").slice(0, 16);
}

function waitForSession(client: any): Promise<any> {
  return new Promise((resolve) => {
    let settled = false;
    function done(session: any) {
      if (settled) return;
      settled = true;
      resolve(session || null);
    }
    client.auth.getSession().then((res: any) => {
      const session = res && res.data && res.data.session;
      if (session) done(session);
    }).catch(() => { /* wait for event */ });
    const sub = client.auth.onAuthStateChange((event: string, session: any) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "SIGNED_OUT") {
        if (sub && sub.data && sub.data.subscription && sub.data.subscription.unsubscribe) {
          try { sub.data.subscription.unsubscribe(); } catch { /* ignore */ }
        }
        done(session || null);
      }
    });
    setTimeout(() => {
      client.auth.getSession().then((res: any) => {
        done(res && res.data && res.data.session);
      }).catch(() => { done(null); });
    }, 2500);
  });
}

type Row = { email?: string; business_name?: string; deletion_requested_at?: string; purge_after?: string };
type View = { status: string; isErr: boolean; rows: Row[] | null };

export function Admin() {
  const [v, setV] = useState<View>({ status: "Checking access…", isErr: false, rows: null });
  useEffect(() => {
    const needLogin = () => setV({ status: "Please log in to Receipt Pilot first.", isErr: true, rows: null });
    const deny = () => setV({ status: "You do not have permission to access this page.", isErr: true, rows: null });
    const render = (rows: Row[]) => setV(rows.length ? { status: "", isErr: false, rows } : { status: "No pending requests.", isErr: false, rows: [] });
    (async () => {
      let client: any;
      try { client = await cloudReady(); } catch { needLogin(); return; }
      if (!client) { needLogin(); return; }
      const session = await waitForSession(client);
      if (!session) { needLogin(); return; }
      let res: any;
      try { res = await client.rpc("list_account_deletion_requests"); } catch { deny(); return; }
      if (res.error) { deny(); return; }
      render(res.data || []);
    })();
  }, []);

  const clean = (s: any) => String(s || "—").replace(/</g, "");
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-[1.75rem] font-extrabold tracking-tight md:text-3xl">Account Deletion Requests</h1>
        <p className="mt-1 text-[15px] text-muted">Pending requests only. Access is restricted to authorized Receipt Pilot owners.</p>
      </div>
      {v.status ? (
        <p id="adminStatus" role={v.isErr ? "alert" : "status"} className={cx("text-[15px]", v.isErr ? "rounded-xl bg-danger-bg px-3 py-2 font-semibold text-[#991b1b]" : "text-muted")}>{v.status}</p>
      ) : null}
      {v.rows ? (
        <Card id="adminTableWrap" className="overflow-hidden">
          {/* Phones: one card per request */}
          <ul className="divide-y divide-line md:hidden" aria-label="Deletion requests">
            {v.rows.length ? v.rows.map((r, i) => (
              <li key={i} className="space-y-1 p-4 text-[15px]">
                <p className="font-semibold break-all">{clean(r.email)}</p>
                <p className="text-muted">{clean(r.business_name)}</p>
                <p><span className="text-muted">Requested:</span> {fmt(r.deletion_requested_at)}</p>
                <p><span className="text-muted">Purge Date:</span> {fmt(r.purge_after)}</p>
                <p><span className="text-muted">Status:</span> Pending</p>
              </li>
            )) : <li className="p-4 text-[15px]">No pending deletion requests.</li>}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-[15px]">
              <thead className="bg-slate-50 text-sm text-muted">
                <tr>{["User", "Business", "Requested", "Purge Date", "Status"].map((h) => <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody id="adminBody" className="divide-y divide-line">
                {v.rows.length ? v.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">{clean(r.email)}</td>
                    <td className="px-4 py-3">{clean(r.business_name)}</td>
                    <td className="px-4 py-3">{fmt(r.deletion_requested_at)}</td>
                    <td className="px-4 py-3">{fmt(r.purge_after)}</td>
                    <td className="px-4 py-3">Pending</td>
                  </tr>
                )) : <tr><td colSpan={5} className="px-4 py-3">No pending deletion requests.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
