"use client";
import { useEffect, useState } from "react";
import { authDialog, inlineAuthHost } from "@/lib/bus";
import type { AuthPanel } from "@/lib/bus";
import { ready, userId } from "@/lib/session";
import { useStore } from "@/lib/useStore";
import { useSessionUser } from "@/lib/useSession";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { AuthPanels } from "./AuthPanels";

function safeNext(raw: string | null) {
  const v = String(raw || "");
  // Only same-site paths (never a full URL), e.g. /billing or /records.
  return /^\/(?!\/)[\w\-./?=&%#]*$/.test(v) ? v : "/new";
}

/**
 * Full-page sign-in. Uses the same auth panels as the modal; while this page
 * is open the panels render inline instead of in a dialog.
 */
export function SignIn() {
  const st = useStore(authDialog);
  const { user } = useSessionUser();
  const [next, setNext] = useState("/new");
  const [panel, setPanel] = useState<AuthPanel>("login");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    inlineAuthHost.set(true);
    return () => inlineAuthHost.set(false);
  }, []);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    setNext(safeNext(p.get("next")));
    if (p.get("mode") === "signup") setPanel("signup");
    ready.then(() => setChecking(false));
  }, []);
  // Panel switches requested by the shared auth code land here, not in a modal.
  useEffect(() => {
    if (st.open) {
      if (!(st.panel === "account" && !userId())) setPanel(st.panel);
      authDialog.set({ open: false, panel: st.panel });
    }
  }, [st]);
  useEffect(() => {
    if (!checking && user && panel !== "verify") location.replace(next);
  }, [user, checking, next, panel]);

  return (
    <div className="mx-auto max-w-md py-2 md:py-8">
      <Card className="p-5 sm:p-7">
        {user && !checking ? (
          <div className="space-y-3 text-center">
            <p className="font-semibold">You are signed in.</p>
            <ButtonLink href={next} block>Continue</ButtonLink>
          </div>
        ) : (
          <div key={panel}><AuthPanels panel={panel} inline /></div>
        )}
      </Card>
      <p className="mt-4 text-center text-sm text-muted">Receipts made without an account stay on this device. When you sign in, you can choose to sync them to your account.</p>
    </div>
  );
}
