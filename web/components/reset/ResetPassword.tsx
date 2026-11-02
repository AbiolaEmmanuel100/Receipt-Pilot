"use client";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ready as cloudReady, friendlyError } from "@/lib/cloud";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormMessage, PasswordInput } from "@/components/ui/Field";

function friendlyAuthError(ex: unknown) {
  const e = ex as { message?: string; error_description?: string } | null;
  const m = String((e && (e.message || e.error_description)) || ex || "");
  if (/expired|otp_expired/i.test(m)) return "This reset link has expired. Request a new one and try again.";
  if (/session|invalid|jwt/i.test(m)) return "This reset link is invalid or has already been used.";
  return friendlyError(ex) || "Could not update the password. Request a new reset link.";
}
function linkError() {
  const hash = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
  const query = new URLSearchParams(location.search || "");
  const code = hash.get("error_code") || query.get("error_code") || "";
  const desc = hash.get("error_description") || query.get("error_description") || "";
  if (/otp_expired|expired/i.test(code + " " + desc)) return "This reset link has expired. Request a new one from the login screen.";
  if (hash.get("error") || query.get("error")) return "This reset link is invalid or has already been used.";
  return "";
}

/** Port of reset.html (Supabase password recovery). */
export function ResetPassword() {
  const [status, setStatus] = useState("Checking your reset link.");
  const [showForm, setShowForm] = useState(false);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const bad = linkError();
      if (bad) { setStatus(bad); return; }
      const sb = await cloudReady();
      if (!sb) { setStatus("Unable to load the account service. Check your internet connection and try again."); return; }
      let ok = false;
      sb.auth.onAuthStateChange((event, session) => { if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) ok = true; });
      let session = await sb.auth.getSession();
      if (session.data && session.data.session) ok = true;
      if (!ok) {
        await new Promise((r) => setTimeout(r, 800));
        session = await sb.auth.getSession();
        if (session.data && session.data.session) ok = true;
      }
      if (!ok) { setStatus("This reset link is invalid, expired, or has already been used. Request a new one from the login screen."); return; }
      setStatus("Enter a new password for your Receipt Pilot account.");
      setShowForm(true);
    })();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (a !== b) { setErr("Passwords do not match."); return; }
    if (a.length < 6) { setErr("Use a password of at least 6 characters."); return; }
    const sb = await cloudReady();
    if (!sb) { setErr("Unable to load the account service. Check your internet connection and try again."); return; }
    setBusy(true);
    try {
      const result = await sb.auth.updateUser({ password: a });
      if (result.error) throw result.error;
      try { await sb.auth.signOut(); } catch { /* return to login */ }
      setShowForm(false);
      setStatus("Password updated. You can now log in with the new password.");
      setTimeout(() => { location.href = "/signin"; }, 1200);
    } catch (ex) {
      setErr(friendlyAuthError(ex));
    } finally { setBusy(false); }
  }

  return (
    <Card className="p-5 sm:p-7">
      <h1 className="text-2xl font-extrabold tracking-tight">Choose a new password</h1>
      <p id="resetStatus" role="status" className="mt-1 text-[15px] text-muted">{status}</p>
      {showForm ? (
        <form onSubmit={submit} className="mt-5 space-y-4">
          <PasswordInput id="newPass" label="New password" autoComplete="new-password" value={a} onChange={setA} />
          <PasswordInput id="newPass2" label="Confirm password" autoComplete="new-password" value={b} onChange={setB} />
          <FormMessage error={err} />
          <Button type="submit" block size="lg" busy={busy}>Save password</Button>
        </form>
      ) : null}
    </Card>
  );
}
