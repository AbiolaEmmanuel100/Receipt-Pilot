"use client";
// Native port of notifications.html. Same copy word for word, same rule:
// content only for a signed-in account (after the stored session is read),
// otherwise the "Sign in required" card. No Supabase reads or writes, no
// credentials stored, nothing sent from this page.
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ready, userId } from "@/lib/session";
import { useSessionUser } from "@/lib/useSession";
import { showAuth } from "@/lib/bus";
import { Badge, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { buttonClass } from "@/components/ui/Button";
import { IconLock, IconMail, IconPhone, IconWhatsApp } from "@/components/ui/Icons";

function Meta({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 text-[15px] sm:grid-cols-[160px_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-muted">{k}</dt>
          <dd className="text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Channel({ id, icon, title, status, tone, children }: { id: string; icon: ReactNode; title: string; status: string; tone: "warn" | "neutral"; children: ReactNode }) {
  return (
    <Card className="p-4 sm:p-5" id={id}>
      <section aria-labelledby={id + "-h"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-full bg-brand-50 text-brand-deep">{icon}</span>
            <h2 id={id + "-h"} className="text-[17px] font-semibold">{title}</h2>
          </div>
          <Badge tone={tone}>{status}</Badge>
        </div>
        <div className="mt-2 space-y-2 text-[15px] leading-relaxed">{children}</div>
      </section>
    </Card>
  );
}

export function Notifications() {
  const { user } = useSessionUser();
  const [checked, setChecked] = useState(false);
  useEffect(() => { let on = true; ready.then(() => { if (on) setChecked(true); }).catch(() => { if (on) setChecked(true); }); return () => { on = false; }; }, []);
  const signedIn = checked && !!(user && user.id) && !!userId();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-[1.625rem] font-bold tracking-tight md:text-[1.875rem]">Notification Settings</h1>
        <p className="mt-1 text-[15px] text-muted">Optional ways your business can send digital receipts to customers. These channels are not active until each one is properly configured and verified.</p>
      </div>

      {!checked ? (
        <div aria-busy="true" aria-label="Loading" className="space-y-3"><div className="skeleton h-40 rounded-2xl" /><div className="skeleton h-40 rounded-2xl" /></div>
      ) : !signedIn ? (
        <Card id="notifGate" className="p-5 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-brand-50 text-brand-deep"><IconLock className="size-5" /></span>
          <h2 className="mt-3 text-[17px] font-semibold">Sign in required</h2>
          <p className="mt-1 text-[15px] text-muted">Notification settings are available to authenticated business owners.</p>
          <Button className="mt-4" onClick={() => showAuth("login")}>Account</Button>
        </Card>
      ) : (
        <div id="notifContent" className="space-y-4">
          <Channel id="notif-email" icon={<IconMail className="size-5" />} title="Email" status="Planned / Not configured" tone="warn">
            <p>Send a digital receipt to a customer&apos;s email address.</p>
            <Meta rows={[["Channel", "Email"], ["Sender identity", "Official Receipt Pilot email service"], ["Status", "Planned / Not configured until the sending service has actually been verified and connected."]]} />
            <p className="text-muted">The customer recipient email address is different from the email address used to send messages. Receipt Pilot intends to provide an official platform email service through which businesses can send receipts to customers. This is not connected yet. No messages are sent from this page.</p>
          </Channel>

          <Channel id="notif-whatsapp" icon={<IconWhatsApp className="size-5" />} title="WhatsApp" status="Not connected" tone="neutral">
            <p>Allow businesses to connect an eligible WhatsApp Business sender to send receipts to customers.</p>
            <Meta rows={[["Channel", "WhatsApp"], ["Status", "Not connected"]]} />
            <p className="text-muted">Entering a phone number alone does not enable sending. Provider registration, required approvals, customer consent, and applicable message templates may be required.</p>
            <p><a className={buttonClass("secondary", "md")} href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noopener noreferrer">Official Meta WhatsApp Business Platform docs</a></p>
            <p className="text-sm text-muted">Official Meta documentation for the WhatsApp Business Platform (Cloud API). Actual onboarding, business verification, and sender registration must still be completed outside this page. Nothing is connected from Receipt Pilot.</p>
          </Channel>

          <Channel id="notif-sms" icon={<IconPhone className="size-5" />} title="SMS" status="Not connected" tone="neutral">
            <p>Allow businesses to connect an SMS provider account and an eligible sending number.</p>
            <Meta rows={[["Channel", "SMS"], ["Status", "Not connected"]]} />
            <p className="text-muted">A business&apos;s ordinary phone number is not automatically capable of sending SMS through the website. An SMS provider account and an eligible sending number must be connected separately.</p>
            <p className="rounded-xl border border-dashed border-line px-3 py-2 text-muted">SMS provider registration: placeholder — no provider has been selected yet.</p>
          </Channel>

          <p className="text-sm text-muted">Each business will eventually manage its own notification preferences. External messaging services are funded by the business. Provider credentials, delivery status, consent, and usage limits are reserved for a future server-side implementation. This page does not store credentials or send messages.</p>
        </div>
      )}
    </div>
  );
}
