/* eslint-disable @typescript-eslint/no-explicit-any */
import { ready as cloudReady, configured, friendlyError } from "./cloud";
import { user, userId, setUser, emitAuthChange, resolveReady, RECEIPTS_EVENT } from "./session";
import * as S from "./storage";
import { sync } from "./sync";
import { report } from "./errors";
import { toast, updateChip, showAuth, hideAuth, claimDialog, usageGate, confirm, authDialog } from "./bus";
import { endGuestSession, showGate } from "./usage";

// Port of js/account.js (Supabase auth, entitlement rows, claim dialog,
// session checks). The modal markup lives in components/auth/AuthDialog.tsx.

export const state = {
  pendingVerifyEmail: "",
  pendingOtpEmail: "",
  /** Mirrors the "Remember this email" checkbox that is visible at submit time. */
  rememberChecked: false,
  magicUntil: 0,
  verifyIntro: "",
};

export function isGmailAddress(email: string) { return /@(gmail|googlemail)\.com$/i.test(String(email || "").trim()); }
export function gmailChooserUrl(email: string) {
  return "https://accounts.google.com/AccountChooser?Email=" + encodeURIComponent(String(email || "").trim()) + "&continue=" + encodeURIComponent("https://mail.google.com/mail/");
}

function isVerified(u: any) { return !!(u && (u.email_confirmed_at || u.confirmed_at)); }
function publicOrigin() { return "https://receipt-pilot.com"; }
export function authRedirect(path?: string) { return publicOrigin() + (path || "/"); }

export function trialExpired(u = user()) {
  if (!u) return false;
  const now = Date.now();
  if (u.subscriptionStatus === "active" && u.subscriptionExpiresAt && now < new Date(u.subscriptionExpiresAt).getTime()) return false;
  if (!u.trialEndsAt) return false;
  return now > new Date(u.trialEndsAt).getTime();
}

export function loginPreference(): "magic" | "password" {
  try { return localStorage.getItem("receiptly_login_pref") === "returning" ? "magic" : "password"; } catch { return "password"; }
}

export function rememberedEmail(): string {
  try {
    const email = String(localStorage.getItem("receiptly_remember_email") || "").trim();
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : "";
  } catch { return ""; }
}

function noteSuccessfulSignIn(email: string) {
  state.pendingOtpEmail = "";
  try { localStorage.setItem("receiptly_login_pref", "returning"); } catch { /* preference only */ }
  try {
    if (state.rememberChecked && email) localStorage.setItem("receiptly_remember_email", email);
    else localStorage.removeItem("receiptly_remember_email");
  } catch { /* ignore */ }
}

export function notConnectedMessage() {
  if (configured()) return "Unable to load the account service. Check your internet connection and try again.";
  return "Cloud accounts are not connected yet. Add your Supabase URL and public key in the config.";
}

export async function ensureClient(): Promise<any> { return cloudReady(); }

export function showVerify(email: string, intro?: string) {
  email = String(email || "").trim();
  if (email) state.pendingVerifyEmail = email;
  state.verifyIntro = intro || "Your Receipt Pilot account has been created. We've sent a confirmation link to verify your email address.";
  showAuth("verify");
}

// Entitlement ------------------------------------------------------------
function markEntitlementError(uid: string) {
  const u = user();
  if (!u || u.id !== uid) return;
  u.entitlementError = true;
  if (!u.entitlementChecked) u.entitlementChecked = true;
  report("entitlement_read_failed", "account");
}

async function loadProfileExtras(uid: string) {
  const sb: any = await ensureClient();
  if (!sb || !uid) return;
  let usage: any, sub: any, prof: any;
  try {
    usage = await sb.from("usage").select("trial_ends_at, last_active_at").eq("user_id", uid).maybeSingle();
    sub = await sb.from("subscriptions").select("status, expires_at, plan_code, renewal_mode").eq("user_id", uid).maybeSingle();
    prof = await sb.from("profiles").select("deletion_requested_at, purge_after").eq("id", uid).maybeSingle();
  } catch {
    markEntitlementError(uid);
    return;
  }
  if (!usage || usage.error || !sub || sub.error) { markEntitlementError(uid); return; }
  const u = user();
  if (u && u.id === uid) {
    u.entitlementError = false;
    u.trialEndsAt = usage.data && usage.data.trial_ends_at;
    u.subscriptionStatus = (sub.data && sub.data.status) || "trial";
    u.subscriptionExpiresAt = sub.data && sub.data.expires_at;
    u.planCode = sub.data && sub.data.plan_code;
    u.renewalMode = sub.data && sub.data.renewal_mode;
    u.deletionRequestedAt = prof && prof.data && prof.data.deletion_requested_at;
    u.purgeAfter = prof && prof.data && prof.data.purge_after;
    u.entitlementChecked = true;
    u.entitlementLoadedAt = Date.now();
  }
  try {
    await sb.from("usage").update({ last_active_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", uid);
  } catch { /* activity stamp only */ }
}

/** Re-reads trial/subscription rows (no payment is created) and repaints. */
export async function refreshEntitlement(): Promise<boolean> {
  const uid = userId();
  if (!uid) return false;
  await loadProfileExtras(uid);
  emitAuthChange();
  const u = user();
  return !!(u && u.entitlementChecked && !u.entitlementError);
}

// Sign-in lifecycle --------------------------------------------------------
let signInJob: Promise<void> | null = null;
let signInUserId: string | null = null;
let claimAskedFor: string | null = null;

async function onSignedIn(userObj: any) {
  if (!userObj) return;
  if (signInJob && signInUserId === userObj.id) return signInJob;
  signInUserId = userObj.id;
  signInJob = runSignedIn(userObj);
  try { await signInJob; } finally { signInJob = null; }
}

async function runSignedIn(userObj: any) {
  if (!isVerified(userObj)) {
    setUser(null);
    state.pendingVerifyEmail = userObj.email || state.pendingVerifyEmail;
    const sb: any = await ensureClient();
    if (sb) { try { await sb.auth.signOut(); } catch { /* ignore */ } }
    showVerify(userObj.email || state.pendingVerifyEmail, "Please check your email and click the verification link before logging in.");
    return;
  }
  setUser({
    id: userObj.id,
    email: userObj.email,
    businessName: (userObj.user_metadata && userObj.user_metadata.business_name) || "",
    lastSignIn: userObj.last_sign_in_at || "",
  });
  noteSuccessfulSignIn(userObj.email || "");
  await S.setMeta("lastUserId", userObj.id);
  await S.adoptGuestBusinessIfNeeded();
  await S.adoptGuestReceiptsIfNewAccount();
  await S.catchUpSequence();
  emitAuthChange();
  usageGate.set(false);
  await loadProfileExtras(userObj.id);
  await maybeClaimLocal();
  await S.catchUpSequence();
  Promise.resolve(sync()).catch(() => {});
  emitAuthChange();
}

function onSignedOut() {
  setUser(null);
  claimAskedFor = null;
  state.pendingOtpEmail = "";
  S.setMeta("lastUserId", null).catch(() => {});
  try { localStorage.setItem("receiptly_auth_event", "out:" + Date.now()); } catch { /* ignore */ }
  updateChip("");
  emitAuthChange();
}

async function maybeClaimLocal() {
  const uid = userId();
  if (!uid || claimAskedFor === uid) return;
  const rows = await S.listUnownedReceipts();
  if (!rows.length) return;
  claimAskedFor = uid;
  claimDialog.set({ open: true, count: rows.length });
}

export async function claimLocal(yes: boolean) {
  claimDialog.set({ open: false, count: 0 });
  if (!yes) return;
  const uid = userId();
  if (!uid) return;
  const rows = await S.listUnownedReceipts();
  for (const r of rows) {
    if (!r.userId) {
      r.userId = uid;
      r.syncStatus = "pending";
      await S.saveReceipt(r);
    }
  }
  await S.catchUpSequence();
  try { document.dispatchEvent(new CustomEvent(RECEIPTS_EVENT)); } catch { /* ignore */ }
  await sync();
  try { document.dispatchEvent(new CustomEvent(RECEIPTS_EVENT)); } catch { /* ignore */ }
  toast("Receipts synced to your account.");
}

// Actions used by the auth dialog. Each returns an error string or "".
export async function register(biz: string, email: string, pass: string, pass2: string): Promise<{ error?: string; verify?: boolean }> {
  if (pass !== pass2) return { error: "Passwords don't match." };
  if (pass.length < 6) return { error: "Use a password of at least 6 characters." };
  const sb: any = await ensureClient();
  if (!sb) return { error: notConnectedMessage() };
  try {
    const result = await sb.auth.signUp({ email, password: pass, options: { data: { business_name: biz }, emailRedirectTo: authRedirect("/") } });
    if (result.error) throw result.error;
    state.pendingVerifyEmail = email;
    if (result.data && result.data.session) {
      hideAuth();
      toast("You are signed in.");
      return {};
    }
    showVerify(email);
    toast("Check your email to verify your account.");
    return { verify: true };
  } catch (e) {
    return { error: friendlyError(e) };
  }
}

export async function login(email: string, password: string): Promise<{ error?: string }> {
  const sb: any = await ensureClient();
  if (!sb) return { error: notConnectedMessage() };
  try {
    const result = await sb.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    const u = result.data && result.data.user;
    if (!isVerified(u)) {
      state.pendingVerifyEmail = email;
      try { await sb.auth.signOut(); } catch { /* ignore */ }
      onSignedOut();
      showVerify(email, "Please check your email and click the verification link before logging in.");
      return {};
    }
    hideAuth();
    toast("You are signed in.");
    return {};
  } catch (e) {
    return { error: friendlyError(e) };
  }
}

function lockReturningGuest() {
  endGuestSession();
  showGate();
}

export async function logout() {
  const sb: any = await ensureClient();
  if (sb) { try { await sb.auth.signOut(); } catch { /* ignore */ } }
  onSignedOut();
  lockReturningGuest();
  hideAuth();
  toast("You have logged out.");
}

export async function signOutOthers() {
  const sb: any = await ensureClient();
  if (!sb) return;
  const ok = await confirm({ title: "Sign out other devices?", message: "This will sign out all other sessions for this account. This device will stay signed in.", confirmLabel: "Sign out others" });
  if (!ok) return;
  try {
    const res = await sb.auth.signOut({ scope: "others" });
    if (res && res.error) throw res.error;
    toast("Other devices have been signed out.");
  } catch {
    toast("Could not sign out other devices right now.", "error");
  }
}

export async function deleteOwnAccount(): Promise<string> {
  const ok = await confirm({
    title: "Delete your Receipt Pilot account?",
    message: "Your account will be scheduled for deletion in 30 days. You can recover it before then. Your receipts stay available during that period.",
    confirmLabel: "Delete Account", danger: true, requireText: "DELETE",
  });
  if (!ok) return "";
  const sb: any = await ensureClient();
  if (!sb) return notConnectedMessage();
  try {
    const res = await sb.rpc("request_account_deletion");
    if (res.error) throw res.error;
    const uid = userId();
    const u = user();
    if (uid) {
      try {
        const prof = await sb.from("profiles").select("deletion_requested_at, purge_after").eq("id", uid).maybeSingle();
        if (u) { u.deletionRequestedAt = prof.data && prof.data.deletion_requested_at; u.purgeAfter = prof.data && prof.data.purge_after; }
      } catch {
        if (u) { u.deletionRequestedAt = new Date().toISOString(); u.purgeAfter = new Date(Date.now() + 30 * 86400000).toISOString(); }
      }
    }
    toast("Your account is scheduled for deletion in 30 days. You can recover it before then.");
    emitAuthChange();
    return "";
  } catch (e: any) {
    report((e && e.message) || "request deletion", "auth");
    return "Could not schedule account deletion. Run supabase/migrations/005_account_deletion_request.sql in Supabase.";
  }
}

export async function cancelAccountDeletion(): Promise<string> {
  const sb: any = await ensureClient();
  if (!sb) return notConnectedMessage();
  try {
    const res = await sb.rpc("cancel_account_deletion");
    if (res.error) throw res.error;
    const u = user();
    if (u) { u.deletionRequestedAt = null; u.purgeAfter = null; }
    toast("Account deletion cancelled.");
    emitAuthChange();
    return "";
  } catch (e: any) {
    report((e && e.message) || "cancel deletion", "auth");
    return "Could not cancel deletion right now.";
  }
}

export function authErrorMessage(err: any): string {
  const status = err && (err.status || err.code || "");
  const m = String((err && (err.message || err.error_description)) || err || "");
  report(("auth " + status + " " + m).replace(/https?:\/\/\S+/g, "[url]").slice(0, 160), "auth");
  if (/rate limit|too many/i.test(m)) return "Too many attempts. Please wait a moment and try again.";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "Unable to reach Receipt Pilot right now. Check your connection and try again.";
  if (/redirect|not allowed/i.test(m)) return "The reset link could not be prepared. Check the site address and try again.";
  if (/invalid email|email address/i.test(m)) return "Enter a valid email address.";
  return friendlyError(err);
}

export async function sendReset(email: string): Promise<{ error?: string; ok?: string }> {
  email = (email || "").trim();
  if (!email) return { error: "Enter the email for your account." };
  const sb: any = await ensureClient();
  if (!sb) return { error: notConnectedMessage() };
  try {
    const result = await sb.auth.resetPasswordForEmail(email, { redirectTo: authRedirect("/reset.html") });
    if (result.error) throw result.error;
    toast("Password reset email sent.");
    return { ok: "If that email has an account, a reset link is on its way." };
  } catch (e) {
    return { error: authErrorMessage(e) };
  }
}

export async function resendVerify(email: string): Promise<{ error?: string; ok?: string }> {
  email = String(email || "").trim();
  if (!email) return { error: "Enter your email on the login screen first." };
  const sb: any = await ensureClient();
  if (!sb) return { error: notConnectedMessage() };
  try {
    const result = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: authRedirect("/") } });
    if (result.error) throw result.error;
    toast("Confirmation email sent.");
    return { ok: "Confirmation email sent. Check your inbox and spam folder." };
  } catch (e) {
    return { error: authErrorMessage(e) };
  }
}

/** Returns {error, waitSeconds} like otpWaitMessage() in account.js. */
export function otpWaitMessage(err: any): { error: string; wait?: number } {
  const m = String((err && (err.message || err.error_description)) || err || "");
  const match = m.match(/(\d+)\s*second/i);
  const seconds = match ? Number(match[1]) : 60;
  if (/rate limit|too many|only request|security purposes|after \d+/i.test(m)) {
    state.magicUntil = Date.now() + Math.max(1, seconds) * 1000;
    return { error: "Please wait " + seconds + " seconds before requesting another code. Your previous code may still be valid.", wait: seconds };
  }
  return { error: authErrorMessage(err) };
}

export async function sendMagic(email: string): Promise<{ error?: string; ok?: string }> {
  if (Date.now() < state.magicUntil) {
    const left = Math.ceil((state.magicUntil - Date.now()) / 1000);
    return { error: "Please wait " + left + " seconds before requesting another code." };
  }
  email = String(email || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  const sb: any = await ensureClient();
  if (!sb) return { error: notConnectedMessage() };
  try {
    const result = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirect("/"), shouldCreateUser: false } });
    if (result.error) throw result.error;
    state.magicUntil = Date.now() + 60000;
    state.pendingOtpEmail = email;
    return { ok: "Request accepted. If this address can sign in, a code is on its way. This does not confirm delivery." };
  } catch (e) {
    return { error: otpWaitMessage(e).error };
  }
}

export async function resendOtp(): Promise<{ error?: string; ok?: string }> {
  if (!state.pendingOtpEmail) return { error: "" };
  if (Date.now() < state.magicUntil) {
    const left = Math.ceil((state.magicUntil - Date.now()) / 1000);
    return { error: "Please wait " + left + " seconds before requesting another code. Your previous code may still be valid." };
  }
  const sb: any = await ensureClient();
  if (!sb) return { error: notConnectedMessage() };
  try {
    const result = await sb.auth.signInWithOtp({ email: state.pendingOtpEmail, options: { emailRedirectTo: authRedirect("/"), shouldCreateUser: false } });
    if (result.error) throw result.error;
    state.magicUntil = Date.now() + 60000;
    return { ok: "Request accepted. Enter the newest code. This does not confirm delivery." };
  } catch (e) {
    return { error: otpWaitMessage(e).error };
  }
}

export async function verifyCode(codeRaw: string): Promise<{ error?: string; ok?: string }> {
  const code = String(codeRaw || "").replace(/\D/g, "").slice(0, 6);
  if (!state.pendingOtpEmail || !/^\d{6}$/.test(code)) return { error: "Enter the six-digit code from the email." };
  const sb: any = await ensureClient();
  if (!sb) return { error: notConnectedMessage() };
  try {
    let result = await sb.auth.verifyOtp({ email: state.pendingOtpEmail, token: code, type: "email" });
    if (result.error) result = await sb.auth.verifyOtp({ email: state.pendingOtpEmail, token: code, type: "magiclink" });
    if (result.error) throw result.error;
    hideAuth();
    return { ok: "Code accepted. Signing you in." };
  } catch (e: any) {
    const m = String((e && e.message) || "");
    if (/expired/i.test(m)) return { error: "That code has expired. Request a new one." };
    if (/invalid|otp|token/i.test(m)) return { error: "That code is invalid or has already been used." };
    return { error: authErrorMessage(e) };
  }
}

// Re-authentication before an email change (5-minute window).
export function reauthFresh() {
  let at = 0;
  try { at = Number(sessionStorage.getItem("receiptly_reauth_at") || 0); } catch { at = 0; }
  return at > 0 && Date.now() - at < 5 * 60 * 1000;
}

export async function submitReauth(pass: string): Promise<string> {
  const u = user();
  const email = u && u.email;
  if (!email || !pass) return "Enter your current password.";
  const sb: any = await ensureClient();
  if (!sb) return notConnectedMessage();
  try {
    const result = await sb.auth.signInWithPassword({ email, password: pass });
    if (result.error) throw result.error;
    try { sessionStorage.setItem("receiptly_reauth_at", String(Date.now())); } catch { /* ignore */ }
    return "";
  } catch (e: any) {
    return /Invalid login credentials/i.test(String((e && e.message) || "")) ? "That password is not correct." : "Could not confirm your identity. Try again.";
  }
}

export async function requestEmailChange(newEmail: string): Promise<{ error?: string; ok?: string; status?: string }> {
  const email = String(newEmail || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  const u = user();
  if (u && String(u.email || "").toLowerCase() === email) return { error: "That is already your email address." };
  const sb: any = await ensureClient();
  if (!sb) return { error: notConnectedMessage() };
  try {
    const result = await sb.auth.updateUser({ email, options: { emailRedirectTo: authRedirect("/") } });
    if (result.error) throw result.error;
    const current = result.data && result.data.user && result.data.user.email;
    const pending = result.data && result.data.user && (result.data.user.new_email || result.data.user.email_change);
    if (current && String(current).toLowerCase() === email) return { ok: "Email address updated.", status: "Your email address is now " + email + "." };
    return {
      ok: "Confirmation requested. Your current email remains active until the new address is confirmed.",
      status: pending ? "Confirmation pending for " + pending + ". Your current email is still active." : "Confirmation pending. Your current email is still active.",
    };
  } catch (e: any) {
    const m = String((e && e.message) || "");
    if (/already|registered|exists/i.test(m)) return { error: "That email already has an account." };
    return { error: authErrorMessage(e) };
  }
}

// Auth callback params (email links) ------------------------------------
function authCallbackMessage() {
  const hash = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
  const query = new URLSearchParams(location.search || "");
  const code = hash.get("error_code") || query.get("error_code") || "";
  const desc = hash.get("error_description") || query.get("error_description") || "";
  const type = hash.get("type") || query.get("type") || "";
  if (/otp_expired|expired/i.test(code + " " + desc)) return "This email link has expired. Request a new verification or reset link and try again.";
  if (hash.get("error") || query.get("error")) return "This email link is invalid or has already been used.";
  if (type === "recovery") return "";
  if (type === "magiclink") return "Sign-in link accepted.";
  if (type === "signup" || type === "email") return "Email verified. You can continue in Receipt Pilot.";
  return "";
}

function clearAuthParams() {
  if (!location.hash && !/[?&](error|error_code|type|access_token)=/.test(location.search)) return;
  history.replaceState(null, "", location.pathname + location.search.replace(/[?&](error|error_code|error_description|type|access_token|refresh_token)=[^&]*/g, "").replace(/[?&]$/, ""));
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
}

// Boot ------------------------------------------------------------------
let booted = false;
export function initAccount(opts: { wantsSignIn?: boolean } = {}) {
  if (booted || typeof window === "undefined") return;
  booted = true;

  window.addEventListener("storage", (e) => {
    if (!e || e.key !== "receiptly_auth_event") return;
    if (e.newValue && String(e.newValue).indexOf("out:") === 0) {
      setUser(null);
      claimAskedFor = null;
      S.setMeta("lastUserId", null).catch(() => {});
      emitAuthChange();
    }
  });

  let sessionCheckBusy = false;
  function remoteSessionRevoked(err: any) {
    const m = String((err && (err.message || err.code || err.error_description)) || "");
    if (/Failed to fetch|NetworkError|network|offline|timeout/i.test(m)) return false;
    return /refresh_token|Invalid Refresh Token|session_not_found|Auth session missing|not authenticated|invalid jwt|jwt expired/i.test(m);
  }
  async function validateRemoteSession() {
    if (sessionCheckBusy || !user()) return;
    const sb: any = await ensureClient();
    if (!sb) return;
    sessionCheckBusy = true;
    try {
      const res = await sb.auth.getUser();
      if (res && res.error && remoteSessionRevoked(res.error)) { onSignedOut(); return; }
      if (res && !res.error && !(res.data && res.data.user) && user()) onSignedOut();
    } catch (e) {
      if (remoteSessionRevoked(e)) onSignedOut();
    } finally {
      sessionCheckBusy = false;
    }
  }
  let lastEntitlementCheck = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    validateRemoteSession();
    if (user() && Date.now() - lastEntitlementCheck > 60000) {
      lastEntitlementCheck = Date.now();
      refreshEntitlement();
    }
  });
  window.addEventListener("online", () => {
    updateChip("Back online — syncing...");
    validateRemoteSession();
    sync();
  });
  window.addEventListener("offline", () => updateChip("Offline — Changes saved on this device", true));
  if (!navigator.onLine) updateChip("Offline — Changes saved on this device", true);

  ensureClient().then((sb: any) => {
    const callbackMessage = authCallbackMessage();
    if (callbackMessage) toast(callbackMessage);
    clearAuthParams();
    if (!sb) { resolveReady(); return; }
    sb.auth.onAuthStateChange((event: string, session: any) => {
      if (event === "PASSWORD_RECOVERY" || event === "TOKEN_REFRESHED") return;
      if (event === "INITIAL_SESSION") return;
      if (session && session.user) {
        // Defer: supabase-js warns against awaiting other auth calls inside this callback.
        setTimeout(() => { onSignedIn(session.user).then(() => resolveReady()); }, 0);
      } else if (event === "SIGNED_OUT") {
        onSignedOut();
        resolveReady();
      }
    });
    sb.auth.getSession().then((res: any) => {
      if (res.data && res.data.session && res.data.session.user) return onSignedIn(res.data.session.user);
      onSignedOut();
    }).finally(() => {
      resolveReady();
      if (opts.wantsSignIn && !userId()) showAuth("login");
    });
  });
}

export function openAccountOrLogin() {
  if (userId()) showAuth("account");
  else showAuth("login");
}

export { authDialog };
