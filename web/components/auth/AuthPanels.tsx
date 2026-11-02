"use client";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import * as A from "@/lib/account";
import { authDialog, hideAuth, showAuth } from "@/lib/bus";
import type { AuthPanel } from "@/lib/bus";
import { useStore } from "@/lib/useStore";
import { useSessionUser } from "@/lib/useSession";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Checkbox, Field, FormMessage, Input, PasswordInput } from "@/components/ui/Field";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function Switch({ children }: { children: ReactNode }) {
  return <p className="text-center text-[15px] text-muted">{children}</p>;
}
function LinkBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className="inline-flex min-h-11 items-center px-1 font-semibold text-brand underline-offset-4 hover:underline">{children}</button>;
}
function Heading({ title, intro }: { title: string; intro?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h2>
      {intro ? <p className="mt-1 text-[15px] text-muted">{intro}</p> : null}
    </div>
  );
}

/** All auth panels from account.js (login, code sign-in, sign-up, verify, forgot, reauth, account). */
export function AuthPanels({ panel, inline }: { panel: AuthPanel; inline?: boolean }) {
  const go = (p: AuthPanel) => showAuth(p);
  if (panel === "signup") return <SignupPanel go={go} />;
  if (panel === "verify") return <VerifyPanel go={go} />;
  if (panel === "forgot") return <ForgotPanel go={go} />;
  if (panel === "reauth") return <ReauthPanel />;
  if (panel === "account") return <AccountPanel inline={inline} />;
  return <LoginPanel go={go} />;
}

let carryEmail = "";

function LoginPanel({ go }: { go: (p: AuthPanel) => void }) {
  const [mode, setMode] = useState<"magic" | "password">(() => (A.state.pendingOtpEmail ? "magic" : A.loginPreference()));
  const remembered = A.rememberedEmail();
  const [email, setEmail] = useState(remembered || carryEmail);
  const [remember, setRemember] = useState(!!remembered);
  const [pass, setPass] = useState("");
  const [otpStep, setOtpStep] = useState(!!A.state.pendingOtpEmail);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { A.state.rememberChecked = remember; }, [remember]);
  useEffect(() => {
    if (!otpStep) return;
    const t = setInterval(() => tick((v) => v + 1), 1000);
    codeRef.current?.focus();
    return () => clearInterval(t);
  }, [otpStep]);

  function switchMode(m: "magic" | "password") { setErr(""); setOk(""); setMode(m); if (m === "magic") setOtpStep(!!A.state.pendingOtpEmail); }

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    A.state.rememberChecked = remember;
    const res = await A.login(email.trim(), pass);
    setBusy(false);
    if (res.error) setErr(res.error);
  }
  async function onMagic(e: FormEvent) {
    e.preventDefault();
    setErr(""); setOk(""); setBusy(true);
    A.state.rememberChecked = remember;
    const res = await A.sendMagic(email);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOk(res.ok || ""); setCode(""); setOtpStep(true);
  }
  async function submitCode(value: string) {
    if (busy) return;
    setErr(""); setBusy(true);
    const res = await A.verifyCode(value);
    setBusy(false);
    if (res.error) setErr(res.error); else setOk(res.ok || "");
  }
  async function resend() {
    setErr(""); setOk("");
    const res = await A.resendOtp();
    if (res.error) setErr(res.error); else setOk(res.ok || "");
  }
  const wait = Math.max(0, Math.ceil((A.state.magicUntil - Date.now()) / 1000));

  return (
    <div>
      <Heading title="Welcome back" intro="Sign in securely to access your saved receipts." />
      {mode === "magic" ? (
        <div className="space-y-4">
          {!otpStep ? (
            <form onSubmit={onMagic} className="space-y-4" noValidate>
              <Field label="Email address" id="magicEmail">
                <Input id="magicEmail" type="email" inputMode="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} data-autofocus />
              </Field>
              <FormMessage error={err} ok={ok} />
              <Checkbox checked={remember} onChange={setRemember}>Remember this email on this browser</Checkbox>
              <Button type="submit" block size="lg" busy={busy}>Email me a sign-in code</Button>
              {A.state.pendingOtpEmail ? <Switch><LinkBtn onClick={() => { setOtpStep(true); setCode(""); }}>Enter the code I already have</LinkBtn></Switch> : null}
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); submitCode(code); }} className="space-y-4" noValidate>
              <div className="rounded-2xl bg-brand-50 p-4">
                <h3 className="font-bold text-ink">Check your email</h3>
                <p id="otpEmailLine" className="text-[15px] text-muted">Enter the code sent to {A.state.pendingOtpEmail}.</p>
              </div>
              <Field label="Six-digit sign-in code" id="otpCode">
                <Input ref={codeRef} id="otpCode" name="one-time-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}"
                  enterKeyHint="done" spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-describedby="otpEmailLine" required
                  className="text-center text-2xl font-bold tracking-[0.5em] tabular" value={code}
                  onChange={(e) => { const d = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(d); if (d.length === 6) submitCode(d); }} />
              </Field>
              <FormMessage error={err} ok={ok} />
              <Button type="submit" block size="lg" busy={busy}>Verify and sign in</Button>
              <Switch>
                <LinkBtn onClick={resend}>{wait > 0 ? "Resend code in " + wait + "s" : "Resend code"}</LinkBtn> · <LinkBtn onClick={() => { setErr(""); setOk(""); setOtpStep(false); }}>Use a different email</LinkBtn>
              </Switch>
            </form>
          )}
          <p className="text-sm text-muted">We&apos;ll email a sign-in code for this address. Enter it here. This is not a password reset.</p>
          <Switch>Prefer using a password? <LinkBtn onClick={() => switchMode("password")}>Log in with password</LinkBtn></Switch>
        </div>
      ) : (
        <div className="space-y-4">
          <form onSubmit={onPassword} className="space-y-4">
            <Field label="Email address" id="loginEmail">
              <Input id="loginEmail" type="email" inputMode="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} data-autofocus />
            </Field>
            <PasswordInput id="loginPass" label="Password" autoComplete="current-password" value={pass} onChange={setPass} />
            <div className="-mt-2 flex justify-end"><LinkBtn onClick={() => { carryEmail = email; go("forgot"); }}>Forgot password?</LinkBtn></div>
            <FormMessage error={err} />
            <Checkbox checked={remember} onChange={setRemember}>Remember this email on this browser</Checkbox>
            <Button type="submit" block size="lg" busy={busy}>Log in</Button>
          </form>
          <Switch><LinkBtn onClick={() => switchMode("magic")}>Sign in with an email code</LinkBtn></Switch>
        </div>
      )}
      <div className="mt-4 border-t border-line pt-3">
        <Switch>Don&apos;t have an account? <LinkBtn onClick={() => go("signup")}>Create account</LinkBtn></Switch>
      </div>
    </div>
  );
}

function SignupPanel({ go }: { go: (p: AuthPanel) => void }) {
  const [biz, setBiz] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const res = await A.register(biz.trim(), email.trim(), pass, pass2);
    setBusy(false);
    if (res.error) setErr(res.error);
  }
  return (
    <div>
      <Heading title="Create account" intro="Start your 14-day free trial." />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Business name" id="accBiz"><Input id="accBiz" required autoComplete="organization" value={biz} onChange={(e) => setBiz(e.target.value)} data-autofocus /></Field>
        <Field label="Email" id="accEmail"><Input id="accEmail" type="email" inputMode="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <PasswordInput id="accPass" label="Password" autoComplete="new-password" value={pass} onChange={setPass} />
        <PasswordInput id="accPass2" label="Confirm password" autoComplete="new-password" value={pass2} onChange={setPass2} />
        <FormMessage error={err} />
        <Button type="submit" block size="lg" busy={busy}>Create account</Button>
      </form>
      <div className="mt-4 border-t border-line pt-3"><Switch>Already have an account? <LinkBtn onClick={() => go("login")}>Log in</LinkBtn></Switch></div>
    </div>
  );
}

function VerifyPanel({ go }: { go: (p: AuthPanel) => void }) {
  const email = A.state.pendingVerifyEmail;
  const gmail = A.isGmailAddress(email);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  async function copy() {
    setErr(""); setOk("");
    if (!email) { setErr("No email address is available to copy."); return; }
    try { await navigator.clipboard.writeText(email); setOk("Copied " + email + "."); }
    catch { setErr("Could not copy the email. Select " + email + " and copy it manually."); }
  }
  async function resend() {
    setErr(""); setOk(""); setBusy(true);
    const res = await A.resendVerify(email);
    setBusy(false);
    if (res.error) setErr(res.error); else setOk(res.ok || "");
  }
  return (
    <div className="space-y-4">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-ok-bg text-2xl font-bold text-ok" aria-hidden="true">✓</div>
      <Heading title="Check your email" intro={A.state.verifyIntro || "Your Receipt Pilot account has been created. We've sent you a confirmation link to verify your email address."} />
      <div className="rounded-2xl border border-line bg-bg p-4">
        <strong className="block">Check this inbox</strong>
        <p className="break-all font-semibold text-brand">{email}</p>
        <p className="text-sm text-muted">{email ? "Open the inbox for " + email + " and click the confirmation link from Receipt Pilot." : "Open the email from Receipt Pilot and click the confirmation link."}</p>
      </div>
      {gmail ? <ButtonLink href={A.gmailChooserUrl(email)} target="_blank" rel="noopener noreferrer" block>Open Gmail for this address</ButtonLink> : null}
      <Button variant="secondary" block onClick={copy}>Copy email address</Button>
      <p className="text-sm text-muted">{gmail
        ? "If Gmail opens a different account, switch to " + email + ". Google may open the account already signed in on this browser. You can also open this address in any email app. Check spam or junk if you do not see it."
        : "Open this address in your email app. Check spam or junk if you do not see the message."}</p>
      <FormMessage error={err} ok={ok} />
      <Button variant="secondary" block onClick={resend} busy={busy}>Resend confirmation email</Button>
      <Switch><LinkBtn onClick={() => go("login")}>Back to log in</LinkBtn></Switch>
    </div>
  );
}

function ForgotPanel({ go }: { go: (p: AuthPanel) => void }) {
  const [email, setEmail] = useState(carryEmail);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(""); setOk(""); setBusy(true);
    const res = await A.sendReset(email);
    setBusy(false);
    if (res.error) setErr(res.error); else setOk(res.ok || "");
  }
  return (
    <div>
      <Heading title="Reset password" intro="Enter your email and we will send a reset link." />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" id="forgotEmail"><Input id="forgotEmail" type="email" inputMode="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} data-autofocus /></Field>
        <FormMessage error={err} ok={ok} />
        <Button type="submit" block size="lg" busy={busy}>Send reset link</Button>
      </form>
      <div className="mt-2"><Switch><LinkBtn onClick={() => go("login")}>Back to log in</LinkBtn></Switch></div>
    </div>
  );
}

// Re-auth before an email change (5-minute window), like ensureReauth().
let reauthWait: ((ok: boolean) => void) | null = null;
function ensureReauth(): Promise<boolean> {
  if (A.reauthFresh()) return Promise.resolve(true);
  showAuth("reauth");
  return new Promise((res) => { reauthWait = res; });
}

function ReauthPanel() {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const msg = await A.submitReauth(pass);
    setBusy(false);
    if (msg) { setErr(msg); return; }
    setPass("");
    showAuth("account");
    if (reauthWait) reauthWait(true);
    reauthWait = null;
  }
  function cancel() {
    showAuth("account");
    if (reauthWait) reauthWait(false);
    reauthWait = null;
  }
  return (
    <div>
      <Heading title="Confirm it is you" intro="Enter your current password to continue. This does not change your password." />
      <form onSubmit={submit} className="space-y-4">
        <PasswordInput id="reauthPass" label="Current password" autoComplete="current-password" value={pass} onChange={setPass} />
        <FormMessage error={err} />
        <Button type="submit" block size="lg" busy={busy}>Confirm</Button>
      </form>
      <Switch><LinkBtn onClick={cancel}>Cancel</LinkBtn></Switch>
    </div>
  );
}

let pendingEmailChange = "";

function AccountPanel({ inline }: { inline?: boolean }) {
  const { user } = useSessionUser();
  const [newEmail, setNewEmail] = useState(pendingEmailChange);
  const [emErr, setEmErr] = useState("");
  const [emOk, setEmOk] = useState("");
  const [emStatus, setEmStatus] = useState("Your current email stays active until a new address is confirmed.");
  const [delErr, setDelErr] = useState("");
  const [recErr, setRecErr] = useState("");
  if (!user) return <p className="text-muted">You are signed out.</p>;
  const last = user.lastSignIn ? String(user.lastSignIn).slice(0, 16).replace("T", " ") : "Signed in on this device.";
  const pending = !!user.purgeAfter;

  async function changeEmail(e: FormEvent) {
    e.preventDefault();
    setEmErr(""); setEmOk("");
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setEmErr("Enter a valid email address."); return; }
    if (user && String(user.email || "").toLowerCase() === email) { setEmErr("That is already your email address."); return; }
    pendingEmailChange = newEmail;
    const fresh = await ensureReauth();
    if (!fresh) return;
    const res = await A.requestEmailChange(email);
    pendingEmailChange = "";
    if (res.error) { setEmErr(res.error); return; }
    setEmOk(res.ok || "");
    if (res.status) setEmStatus(res.status);
  }

  const row = (k: string, v: ReactNode) => (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm text-muted">{k}</span><span className="min-w-0 truncate text-right font-semibold">{v}</span>
    </div>
  );
  const sec = "rounded-2xl border border-line p-4";
  return (
    <div className="space-y-4">
      {!inline ? <Heading title="Your Account" intro="Manage your account and security." /> : null}
      <section className={sec + " divide-y divide-line py-1"}>
        {row("Email", user.email || "—")}
        {row("Business", user.businessName || "—")}
        {row("Subscription", <a href="/billing" onClick={() => hideAuth()} className="inline-flex min-h-11 items-center font-semibold text-brand underline-offset-4 hover:underline">Manage subscription</a>)}
        {row("Last sign-in", last)}
      </section>
      <section className={sec}>
        <h3 className="mb-3 font-bold">Security</h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" onClick={() => A.signOutOthers()}>Sign out of other devices</Button>
          <Button variant="ghost" onClick={() => A.logout()}>Log out</Button>
        </div>
      </section>
      <section className={sec}>
        <h3 className="font-bold">Email address</h3>
        <p className="mb-3 text-sm text-muted">{emStatus}</p>
        <form onSubmit={changeEmail} className="space-y-3">
          <Field label="New email" id="newEmail"><Input id="newEmail" type="email" inputMode="email" required autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></Field>
          <FormMessage error={emErr} ok={emOk} />
          <Button type="submit" variant="secondary">Request email change</Button>
        </form>
      </section>
      <section className={sec}>
        <h3 className="font-bold">Notification Settings</h3>
        <p className="mb-3 text-sm text-muted">Optional email, WhatsApp, and SMS receipt channels. Not connected yet.</p>
        <ButtonLink href="/notifications" variant="secondary">Open Notification Settings</ButtonLink>
      </section>
      {!pending ? (
        <section className="rounded-2xl border border-red-200 bg-red-50/50 p-4">
          <h3 className="font-bold text-danger">Delete account</h3>
          <p className="mb-3 text-sm text-muted">Schedules deletion in 30 days. Your receipts and business data stay available until then. You can cancel during that period.</p>
          <FormMessage error={delErr} />
          <Button variant="danger" onClick={async () => setDelErr(await A.deleteOwnAccount())}>Delete my Receipt Pilot account</Button>
        </section>
      ) : (
        <section className={sec}>
          <h3 className="font-bold">Account scheduled for deletion</h3>
          <p className="mb-3 text-sm text-muted">{"Your account and records are being kept until " + String(user.purgeAfter).slice(0, 10) + ". You can cancel the deletion during this period."}</p>
          <FormMessage error={recErr} />
          <Button onClick={async () => setRecErr(await A.cancelAccountDeletion())}>Cancel deletion</Button>
        </section>
      )}
    </div>
  );
}

/** Modal wrapper used inside the app shell. */
export function useAuthDialog() { return useStore(authDialog); }
