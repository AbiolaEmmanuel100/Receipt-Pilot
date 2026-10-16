(function (global) {
  "use strict";

  var sessionUser = null;
  var pendingVerifyEmail = "";
  var readyResolve;
  var ready = new Promise(function (res) { readyResolve = res; });

  function user() { return sessionUser; }
  function userId() { return sessionUser && sessionUser.id; }
  function token() { return sessionUser ? "session" : ""; }

  function isGmailAddress(email) {
    return /@(gmail|googlemail)\.com$/i.test(String(email || "").trim());
  }

  function gmailChooserUrl(email) {
    var address = String(email || "").trim();
    return "https://accounts.google.com/AccountChooser?Email=" + encodeURIComponent(address) +
      "&continue=" + encodeURIComponent("https://mail.google.com/mail/");
  }

  function showVerifyPanel(email, intro) {
    email = String(email || "").trim();
    if (email) pendingVerifyEmail = email;
    var copy = document.getElementById("verifyCopy");
    if (copy) {
      copy.textContent = intro || "Your Receipt Pilot account has been created. We've sent a confirmation link to verify your email address.";
    }
    var address = document.getElementById("verifyAddress");
    if (address) address.textContent = email;
    var emailLine = document.getElementById("verifyEmail");
    if (emailLine) {
      emailLine.textContent = email
        ? "Open the inbox for " + email + " and click the confirmation link from Receipt Pilot."
        : "Open the email from Receipt Pilot and click the confirmation link.";
    }
    var gmail = document.getElementById("openGmail");
    var note = document.getElementById("verifyGmailNote");
    if (gmail) {
      if (isGmailAddress(email)) {
        gmail.hidden = false;
        gmail.href = gmailChooserUrl(email);
        gmail.textContent = "Open Gmail for this address";
      } else {
        gmail.hidden = true;
        gmail.removeAttribute("href");
      }
    }
    if (note) {
      note.textContent = isGmailAddress(email)
        ? "If Gmail opens a different account, switch to " + email + ". Google may open the account already signed in on this browser. You can also open this address in any email app. Check spam or junk if you do not see it."
        : "Open this address in your email app. Check spam or junk if you do not see the message.";
    }
    var ok = document.getElementById("verifyOk");
    var errEl = document.getElementById("verifyError");
    if (ok) ok.textContent = "";
    if (errEl) errEl.textContent = "";
    showPanel("verifyPanel");
  }

  async function copyVerifyEmail() {
    var email = String(pendingVerifyEmail || "").trim();
    var ok = document.getElementById("verifyOk");
    var err = document.getElementById("verifyError");
    if (ok) ok.textContent = "";
    if (err) err.textContent = "";
    if (!email) {
      if (err) err.textContent = "No email address is available to copy.";
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(email);
      } else {
        var input = document.createElement("input");
        input.value = email;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.parentNode.removeChild(input);
      }
      if (ok) ok.textContent = "Copied " + email + ".";
    } catch (e) {
      if (err) err.textContent = "Could not copy the email. Select " + email + " and copy it manually.";
    }
  }
  function isVerified(u) {
    if (!u) return false;
    return !!(u.email_confirmed_at || u.confirmed_at);
  }

  function publicOrigin() {
    return "https://receipt-pilot.com";
  }

  function authRedirect(path) {
    return publicOrigin() + (path || "/");
  }

  function trialExpired(u) {
    if (!u) return false;
    var now = Date.now();
    if (u.subscriptionStatus === "active" && u.subscriptionExpiresAt && now < new Date(u.subscriptionExpiresAt).getTime()) return false;
    if (!u.trialEndsAt) return false;
    return now > new Date(u.trialEndsAt).getTime();
  }

  function show(id, on) {
    var el = document.getElementById(id);
    if (el) el.hidden = !on;
  }

  function cloudReady() {
    return global.ReceiptlyCloud && ReceiptlyCloud.configured() && ReceiptlyCloud.client();
  }

  function notConnectedMessage() {
    if (global.ReceiptlyCloud && ReceiptlyCloud.configured()) {
      return "Unable to load the account service. Check your internet connection and try again.";
    }
    return "Cloud accounts are not connected yet. Add your Supabase URL and public key in js/config.js.";
  }

  async function ensureClient() {
    if (cloudReady()) return ReceiptlyCloud.client();
    if (global.ReceiptlyCloud && ReceiptlyCloud.ready) {
      var c = await ReceiptlyCloud.ready();
      if (c) return c;
    }
    return null;
  }

  function authField(id, label, type, autocomplete) {
    return '<div class="field"><label for="' + id + '">' + label + "</label>" +
      '<div class="auth-field"><input id="' + id + '" class="auth-input" type="' + type + '" required autocomplete="' + autocomplete + '"' +
      (type === "password" ? ' minlength="6"' : "") + "></div></div>";
  }

  function pwField(id, label, autocomplete) {
    return '<div class="field"><label for="' + id + '">' + label + "</label>" +
      '<div class="auth-field">' +
        '<input id="' + id + '" class="auth-input" type="password" minlength="6" required autocomplete="' + autocomplete + '">' +
        '<button type="button" class="pw-toggle" data-pw="' + id + '" tabindex="-1">Show</button>' +
      "</div></div>";
  }

  function resetPasswordToggles(root) {
    if (!root) return;
    root.querySelectorAll(".pw-toggle").forEach(function (btn) {
      var input = document.getElementById(btn.getAttribute("data-pw"));
      if (input) input.type = "password";
      btn.textContent = "Show";
    });
  }

  function resetLoginForm() {
    var form = document.getElementById("loginForm");
    if (form) form.reset();
    var err = document.getElementById("loginError");
    if (err) err.textContent = "";
    resetPasswordToggles(form);
  }

  function resetSignupForm() {
    var form = document.getElementById("signupForm");
    if (form) form.reset();
    var err = document.getElementById("accError");
    if (err) err.textContent = "";
    resetPasswordToggles(form);
  }

  function ensureModals() {
    if (document.getElementById("authDialog")) return;
    ["accountDialog", "loginDialog"].forEach(function (id) {
      var old = document.getElementById(id);
      if (old && old.parentNode) old.parentNode.removeChild(old);
    });
    if (!document.getElementById("claimDialog")) {
      var extra = document.createElement("div");
      extra.innerHTML =
        '<div class="save-dialog" id="claimDialog" hidden><div class="card">' +
          "<h2>Sync existing receipts?</h2>" +
          '<p id="claimCopy">Sync existing receipts to your Receipt Pilot account?</p>' +
          '<div class="actions-bar">' +
            '<button class="btn btn-primary" type="button" id="claimYes">Yes, sync them</button>' +
            '<button class="btn btn-ghost" type="button" id="claimNo">Keep them on this device only</button>' +
          "</div></div></div>" +
        '<div class="sync-chip" id="syncChip" hidden></div>';
      document.body.appendChild(extra);
    }

    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="save-dialog" id="authDialog" hidden>' +
        '<div class="card auth-card">' +
          '<div class="auth-brand"><a class="logo" href="index.html">Receipt<span>ly</span></a>' +
          "<p>Simple receipts. Organized records.</p></div>" +

          '<div id="loginPanel">' +
            "<h2>Log in</h2>" +
            '<form id="loginForm">' +
              authField("loginEmail", "Email", "email", "email") +
              pwField("loginPass", "Password", "current-password") +
              '<p><button type="button" class="auth-link" id="forgotPass">Forgot password?</button></p>' +
              '<p class="error" id="loginError"></p>' +
              '<button class="btn btn-primary" type="submit" id="loginSubmit">Log in</button>' +
            "</form>" +
            '<p class="auth-switch">Don\'t have an account? <button type="button" id="showSignup">Create account</button></p>' +
          "</div>" +

          '<div id="signupPanel" hidden>' +
            "<h2>Create account</h2>" +
            '<form id="signupForm">' +
              authField("accBiz", "Business name", "text", "organization") +
              authField("accEmail", "Email", "email", "email") +
              pwField("accPass", "Password", "new-password") +
              pwField("accPass2", "Confirm password", "new-password") +
              '<p class="error" id="accError"></p>' +
              '<button class="btn btn-primary" type="submit" id="signupSubmit">Create account</button>' +
            "</form>" +
            '<p class="auth-switch">Already have an account? <button type="button" id="showLogin">Log in</button></p>' +
          "</div>" +

          '<div id="verifyPanel" hidden>' +
            '<div class="verify-icon" aria-hidden="true">✓</div>' +
            "<h2>Check your email</h2>" +
            '<p id="verifyCopy">Your Receipt Pilot account has been created. We\'ve sent you a confirmation link to verify your email address.</p>' +
            '<div class="verify-box">' +
              '<strong>Check this inbox</strong>' +
              '<p id="verifyAddress"></p>' +
              '<p id="verifyEmail">Open the email from Receipt Pilot and click the confirmation link.</p>' +
            "</div>" +
            '<a class="btn btn-primary verify-gmail" id="openGmail" href="https://accounts.google.com/AccountChooser" target="_blank" rel="noopener noreferrer" hidden>Open Gmail</a>' +
            '<button class="btn btn-secondary" type="button" id="copyVerifyEmail">Copy email address</button>' +
            '<p class="hint" id="verifyGmailNote">Gmail is only a shortcut. You can open the message in any email provider. Check your spam or junk folder if you do not see it.</p>' +
            '<p class="ok" id="verifyOk"></p>' +
            '<p class="error" id="verifyError"></p>' +
            '<button class="btn btn-secondary" type="button" id="resendVerify">Resend confirmation email</button>' +
            '<p class="auth-switch"><button type="button" id="verifyToLogin">Back to log in</button></p>' +
          "</div>" +

          '<div id="forgotPanel" hidden>' +
            "<h2>Reset password</h2>" +
            "<p>Enter your email and we will send a reset link.</p>" +
            '<form id="forgotForm">' +
              '<div class="field"><label for="forgotEmail">Email</label><input id="forgotEmail" class="auth-input" type="email" required autocomplete="email"></div>' +
              '<p class="error" id="forgotError"></p>' +
              '<p class="ok" id="forgotOk"></p>' +
              '<button class="btn btn-primary" type="submit">Send reset link</button>' +
            "</form>" +
            '<p class="auth-switch"><button type="button" id="forgotToLogin">Back to log in</button></p>' +
          "</div>" +

          '<div id="accountPanel" hidden>' +
            '<header class="acct-head">' +
              "<h2>Your Account</h2>" +
              '<p class="hint">Manage your account and security.</p>' +
            "</header>" +
            '<section class="acct-section">' +
              '<div class="acct-row"><span class="acct-label">Email</span><strong id="accountEmail"></strong></div>' +
              '<div class="acct-row"><span class="acct-label">Business</span><strong id="accountBiz"></strong></div>' +
              '<div class="acct-row"><span class="acct-label">Subscription</span><button type="button" class="auth-link" data-open-billing>Manage subscription</button></div>' +
              '<div class="acct-row"><span class="acct-label">Last sign-in</span><strong id="accountLastSignIn"></strong></div>' +
              '<p id="accountWho" class="sr-only"></p>' +
              '<p id="accountSession" class="sr-only"></p>' +
            "</section>" +
            '<section class="acct-section">' +
              "<h3>Security</h3>" +
              '<div class="acct-actions">' +
                '<button class="btn btn-secondary" type="button" id="signOutOthers">Sign out of other devices</button>' +
                '<button class="btn btn-ghost" type="button" id="doLogout">Log out</button>' +
              "</div>" +
            "</section>" +
            '<section class="acct-section">' +
              "<h3>Notification Settings</h3>" +
              '<p class="hint">Optional email, WhatsApp, and SMS receipt channels. Not connected yet.</p>' +
              '<div class="acct-actions">' +
                '<a class="btn btn-secondary" href="notifications.html">Open Notification Settings</a>' +
              "</div>" +
            "</section>" +
            '<section class="acct-danger" id="deleteAccountSection">' +
              "<h3>Delete account</h3>" +
              "<p class=\"hint\">Schedules deletion in 30 days. Your receipts and business data stay available until then. You can cancel during that period.</p>" +
              '<p class="error" id="deleteAccError"></p>' +
              '<button class="btn btn-danger" type="button" id="deleteAccount">Delete my Receipt Pilot account</button>' +
            "</section>" +
            '<section class="acct-section" id="recoverAccountSection" hidden>' +
              "<h3>Account scheduled for deletion</h3>" +
              '<p class="hint" id="recoverAccountHint">Your account and records are being kept for 30 days. You can cancel the deletion during this period.</p>' +
              '<p class="error" id="recoverAccError"></p>' +
              '<button class="btn btn-primary" type="button" id="cancelAccountDeletion">Cancel deletion</button>' +
            "</section>" +
          "</div>" +

          '<p class="hint" style="text-align:center;margin-top:14px"><button type="button" class="btn btn-ghost btn-sm" id="authClose">Close</button></p>' +
        "</div>" +
      "</div>";
    document.body.appendChild(wrap);
  }

  function showPanel(name) {
    ["loginPanel", "signupPanel", "verifyPanel", "forgotPanel", "accountPanel"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = id !== name;
    });
    if (name === "loginPanel" && !userId()) resetLoginForm();
    if (name === "signupPanel" && !userId()) resetSignupForm();
    show("authDialog", true);
  }

  function setBusy(btn, on, label) {
    if (!btn) return;
    btn.disabled = !!on;
    if (label) btn.textContent = label;
  }

  function paintAccountButtons() {
    document.querySelectorAll("[data-open-login], [data-logout]").forEach(function (btn) {
      btn.textContent = userId() ? "Account" : "Account";
      btn.setAttribute("data-open-login", "1");
      btn.removeAttribute("data-logout");
    });
  }

  async function loadProfileExtras(uid) {
    var sb = cloudReady();
    if (!sb || !uid) return;
    try {
      var usage = await sb.from("usage").select("trial_ends_at, last_active_at").eq("user_id", uid).maybeSingle();
      var sub = await sb.from("subscriptions").select("status, expires_at, plan_code, renewal_mode").eq("user_id", uid).maybeSingle();
      var prof = await sb.from("profiles").select("deletion_requested_at, purge_after").eq("id", uid).maybeSingle();
      if (sessionUser) {
        sessionUser.trialEndsAt = usage.data && usage.data.trial_ends_at;
        sessionUser.subscriptionStatus = (sub.data && sub.data.status) || "trial";
        sessionUser.subscriptionExpiresAt = sub.data && sub.data.expires_at;
        sessionUser.planCode = sub.data && sub.data.plan_code;
        sessionUser.renewalMode = sub.data && sub.data.renewal_mode;
        sessionUser.deletionRequestedAt = prof.data && prof.data.deletion_requested_at;
        sessionUser.purgeAfter = prof.data && prof.data.purge_after;
      }
      await sb.from("usage").update({ last_active_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", uid);
    } catch (e) { /* ignore */ }
  }

  var signInJob = null;
  var signInUserId = null;

  async function onSignedIn(userObj) {
    if (!userObj) return;
    if (signInJob && signInUserId === userObj.id) return signInJob;
    signInUserId = userObj.id;
    signInJob = runSignedIn(userObj);
    try {
      await signInJob;
    } finally {
      signInJob = null;
    }
  }

  async function runSignedIn(userObj) {
    if (!isVerified(userObj)) {
      sessionUser = null;
      paintAccountButtons();
      pendingVerifyEmail = userObj.email || pendingVerifyEmail;
      var sb = await ensureClient();
      if (sb) {
        try { await sb.auth.signOut(); } catch (e) { /* ignore */ }
      }
      showVerifyPanel(userObj.email || pendingVerifyEmail, "Please check your email and click the verification link before logging in.");
      return;
    }
    sessionUser = {
      id: userObj.id,
      email: userObj.email,
      businessName: (userObj.user_metadata && userObj.user_metadata.business_name) || "",
      lastSignIn: userObj.last_sign_in_at || ""
    };
    await ReceiptlyStorage.setMeta("lastUserId", userObj.id);
    if (ReceiptlyStorage.adoptGuestBusinessIfNeeded) {
      await ReceiptlyStorage.adoptGuestBusinessIfNeeded();
    }
    if (ReceiptlyStorage.adoptGuestReceiptsIfNewAccount) {
      await ReceiptlyStorage.adoptGuestReceiptsIfNewAccount();
    }
    if (ReceiptlyStorage.catchUpSequence) {
      await ReceiptlyStorage.catchUpSequence();
    }
    try { document.dispatchEvent(new CustomEvent("receiptly-auth-change")); } catch (e) { /* ignore */ }
    paintAccountButtons();
    var ub = document.getElementById("usageBanner");
    if (ub) ub.hidden = true;
    var ug = document.getElementById("usageGate");
    if (ug) ug.hidden = true;
    await loadProfileExtras(userObj.id);
    await maybeClaimLocal();
    if (ReceiptlyStorage.catchUpSequence) {
      await ReceiptlyStorage.catchUpSequence();
    }
    if (global.ReceiptlySync) {
      Promise.resolve(ReceiptlySync.sync()).catch(function () { /* local data already available */ });
    }
    try { document.dispatchEvent(new CustomEvent("receiptly-auth-change")); } catch (e) { /* ignore */ }
  }

  function onSignedOut() {
    sessionUser = null;
    claimAskedFor = null;
    paintAccountButtons();
    if (global.ReceiptlyStorage && ReceiptlyStorage.setMeta) {
      ReceiptlyStorage.setMeta("lastUserId", null);
    }
    try {
      localStorage.setItem("receiptly_auth_event", "out:" + Date.now());
    } catch (e) { /* ignore */ }
    resetLoginForm();
    resetSignupForm();
    var fe = document.getElementById("forgotEmail");
    if (fe) fe.value = "";
    updateChip("");
    try { document.dispatchEvent(new CustomEvent("receiptly-auth-change")); } catch (e) { /* ignore */ }
  }

  function lockReturningGuest() {
    if (global.ReceiptlyUsage && ReceiptlyUsage.endGuestSession) {
      ReceiptlyUsage.endGuestSession();
    }
    if (global.ReceiptlyUsage && ReceiptlyUsage.showGate) {
      ReceiptlyUsage.showGate();
    }
  }

  var claimAskedFor = null;

  async function maybeClaimLocal() {
    var uid = userId();
    if (!uid || claimAskedFor === uid) return;
    var rows = await (ReceiptlyStorage.listUnownedReceipts
      ? ReceiptlyStorage.listUnownedReceipts()
      : ReceiptlyStorage.getReceipts().then(function (all) {
        return all.filter(function (r) { return r && !r.userId; });
      }));
    var n = rows.length;
    if (!n) return;
    claimAskedFor = uid;
    var copy = document.getElementById("claimCopy");
    if (copy) copy.textContent = "Sync existing receipts to your Receipt Pilot account? " + n + " receipt(s) on this device are not in your account yet.";
    show("claimDialog", true);
  }

  async function claimLocal(yes) {
    show("claimDialog", false);
    if (!yes) return;
    var uid = userId();
    if (!uid) return;
    var rows = await (ReceiptlyStorage.listUnownedReceipts
      ? ReceiptlyStorage.listUnownedReceipts()
      : ReceiptlyStorage.getReceipts().then(function (all) {
        return all.filter(function (r) { return r && !r.userId; });
      }));
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i].userId) {
        rows[i].userId = uid;
        rows[i].syncStatus = "pending";
        await ReceiptlyStorage.saveReceipt(rows[i]);
      }
    }
    if (ReceiptlyStorage.adoptGuestBusinessIfNeeded) {
      await ReceiptlyStorage.adoptGuestBusinessIfNeeded();
    } else {
      var biz = await ReceiptlyStorage.getBusiness();
      if (biz) await ReceiptlyStorage.saveBusiness(biz);
    }
    if (ReceiptlyStorage.catchUpSequence) await ReceiptlyStorage.catchUpSequence();
    if (global.ReceiptlySync) await ReceiptlySync.sync();
    if (global.ReceiptlyUI) ReceiptlyUI.toast("Receipts synced to your account.");
  }

  async function register(ev) {
    ev.preventDefault();
    var err = document.getElementById("accError");
    err.textContent = "";
    var pass = document.getElementById("accPass").value;
    var pass2 = document.getElementById("accPass2").value;
    if (pass !== pass2) {
      err.textContent = "Passwords don't match.";
      return;
    }
    if (pass.length < 6) {
      err.textContent = "Use a password of at least 6 characters.";
      return;
    }
    var sb = await ensureClient();
    if (!sb) {
      err.textContent = notConnectedMessage();
      return;
    }
    var btn = document.getElementById("signupSubmit");
    setBusy(btn, true, "Creating…");
    try {
      var email = document.getElementById("accEmail").value.trim();
      var bizName = document.getElementById("accBiz").value.trim();
      var result = await sb.auth.signUp({
        email: email,
        password: pass,
        options: {
          data: { business_name: bizName },
          emailRedirectTo: authRedirect("/")
        }
      });
      if (result.error) throw result.error;
      pendingVerifyEmail = email;
      if (result.data && result.data.session) {
        resetSignupForm();
        show("authDialog", false);
        if (global.ReceiptlyUI) ReceiptlyUI.toast("You are signed in.");
        return;
      }
      resetSignupForm();
      showVerifyPanel(email);
      if (global.ReceiptlyUI) ReceiptlyUI.toast("Check your email to verify your account.");
    } catch (e) {
      err.textContent = ReceiptlyCloud.friendlyError(e);
    } finally {
      setBusy(btn, false, "Create account");
    }
  }

  async function login(ev) {
    ev.preventDefault();
    var err = document.getElementById("loginError");
    err.textContent = "";
    var sb = await ensureClient();
    if (!sb) {
      err.textContent = notConnectedMessage();
      return;
    }
    var btn = document.getElementById("loginSubmit");
    setBusy(btn, true, "Logging in…");
    try {
      var email = document.getElementById("loginEmail").value.trim();
      var result = await sb.auth.signInWithPassword({
        email: email,
        password: document.getElementById("loginPass").value
      });
      if (result.error) throw result.error;
      var u = result.data && result.data.user;
      if (!isVerified(u)) {
        pendingVerifyEmail = email;
        try { await sb.auth.signOut(); } catch (e) { /* ignore */ }
        onSignedOut();
        resetLoginForm();
        showVerifyPanel(email, "Please check your email and click the verification link before logging in.");
        return;
      }
      resetLoginForm();
      show("authDialog", false);
      if (global.ReceiptlyUI) ReceiptlyUI.toast("You are signed in.");
    } catch (e) {
      err.textContent = ReceiptlyCloud.friendlyError(e);
    } finally {
      setBusy(btn, false, "Log in");
    }
  }

  async function logout() {
    var sb = await ensureClient();
    if (sb) {
      try { await sb.auth.signOut(); } catch (e) { /* ignore */ }
    }
    onSignedOut();
    lockReturningGuest();
    resetLoginForm();
    resetSignupForm();
    show("authDialog", false);
    if (global.ReceiptlyUI) ReceiptlyUI.toast("You have logged out.");
  }

  function openAccountPanel() {
    var email = sessionUser.email || "";
    var biz = sessionUser.businessName || "—";
    var last = sessionUser.lastSignIn
      ? String(sessionUser.lastSignIn).slice(0, 16).replace("T", " ")
      : "Signed in on this device.";
    var who = document.getElementById("accountWho");
    if (who) who.textContent = email + (sessionUser.businessName ? " · " + sessionUser.businessName : "");
    var sess = document.getElementById("accountSession");
    if (sess) sess.textContent = sessionUser.lastSignIn ? "Last sign-in: " + last : last;
    var em = document.getElementById("accountEmail");
    if (em) em.textContent = email || "—";
    var bz = document.getElementById("accountBiz");
    if (bz) bz.textContent = biz;
    var ls = document.getElementById("accountLastSignIn");
    if (ls) ls.textContent = last;
    var err = document.getElementById("deleteAccError");
    if (err) err.textContent = "";
    paintDeletionState();
    showPanel("accountPanel");
  }

  function paintDeletionState() {
    var pending = !!(sessionUser && sessionUser.purgeAfter);
    var delSec = document.getElementById("deleteAccountSection");
    var recSec = document.getElementById("recoverAccountSection");
    if (delSec) delSec.hidden = pending;
    if (recSec) recSec.hidden = !pending;
    var hint = document.getElementById("recoverAccountHint");
    if (hint && pending && sessionUser.purgeAfter) {
      var when = String(sessionUser.purgeAfter).slice(0, 10);
      hint.textContent = "Your account and records are being kept until " + when + ". You can cancel the deletion during this period.";
    }
  }

  async function signOutOthers() {
    var sb = await ensureClient();
    if (!sb) return;
    var ok = await (global.ReceiptlyUI && ReceiptlyUI.confirm ? ReceiptlyUI.confirm({
      title: "Sign out other devices?",
      message: "This will sign out all other sessions for this account. This device will stay signed in.",
      confirmLabel: "Sign out others"
    }) : Promise.resolve(true));
    if (!ok) return;
    try {
      var res = await sb.auth.signOut({ scope: "others" });
      if (res && res.error) throw res.error;
      if (global.ReceiptlyUI) ReceiptlyUI.toast("Other devices have been signed out.");
    } catch (e) {
      if (global.ReceiptlyUI) ReceiptlyUI.toast("Could not sign out other devices right now.", "error");
    }
  }

  async function deleteOwnAccount() {
    var err = document.getElementById("deleteAccError");
    if (err) err.textContent = "";
    var ok = await (global.ReceiptlyUI && ReceiptlyUI.confirm ? ReceiptlyUI.confirm({
      title: "Delete your Receipt Pilot account?",
      message: "Your account will be scheduled for deletion in 30 days. You can recover it before then. Your receipts stay available during that period.",
      confirmLabel: "Delete Account",
      danger: true,
      requireText: "DELETE"
    }) : Promise.resolve(false));
    if (!ok) return;
    var sb = await ensureClient();
    if (!sb) {
      if (err) err.textContent = notConnectedMessage();
      return;
    }
    try {
      var res = await sb.rpc("request_account_deletion");
      if (res.error) throw res.error;
      var uid = userId();
      if (uid) {
        try {
          var prof = await sb.from("profiles").select("deletion_requested_at, purge_after").eq("id", uid).maybeSingle();
          if (sessionUser) {
            sessionUser.deletionRequestedAt = prof.data && prof.data.deletion_requested_at;
            sessionUser.purgeAfter = prof.data && prof.data.purge_after;
          }
        } catch (e2) {
          if (sessionUser) {
            sessionUser.deletionRequestedAt = new Date().toISOString();
            sessionUser.purgeAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          }
        }
      }
      paintDeletionState();
      if (global.ReceiptlyUI) ReceiptlyUI.toast("Your account is scheduled for deletion in 30 days. You can recover it before then.");
    } catch (e) {
      if (err) err.textContent = "Could not schedule account deletion. Run supabase/migrations/005_account_deletion_request.sql in Supabase.";
      if (global.ReceiptlyErrors) ReceiptlyErrors.report((e && e.message) || "request deletion", "auth");
    }
  }

  async function cancelAccountDeletion() {
    var err = document.getElementById("recoverAccError");
    if (err) err.textContent = "";
    var sb = await ensureClient();
    if (!sb) {
      if (err) err.textContent = notConnectedMessage();
      return;
    }
    try {
      var res = await sb.rpc("cancel_account_deletion");
      if (res.error) throw res.error;
      if (sessionUser) {
        sessionUser.deletionRequestedAt = null;
        sessionUser.purgeAfter = null;
      }
      paintDeletionState();
      if (global.ReceiptlyUI) ReceiptlyUI.toast("Account deletion cancelled.");
    } catch (e) {
      if (err) err.textContent = "Could not cancel deletion right now.";
      if (global.ReceiptlyErrors) ReceiptlyErrors.report((e && e.message) || "cancel deletion", "auth");
    }
  }

  async function sendReset(ev) {
    if (ev) ev.preventDefault();
    var err = document.getElementById("forgotError");
    var ok = document.getElementById("forgotOk");
    err.textContent = "";
    ok.textContent = "";
    var email = (document.getElementById("forgotEmail").value || "").trim();
    if (!email) {
      err.textContent = "Enter the email for your account.";
      return;
    }
    var sb = await ensureClient();
    if (!sb) {
      err.textContent = notConnectedMessage();
      return;
    }
    try {
      var result = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: authRedirect("/reset.html")
      });
      if (result.error) throw result.error;
      ok.textContent = "If that email has an account, a reset link is on its way.";
      if (global.ReceiptlyUI) ReceiptlyUI.toast("Password reset email sent.");
    } catch (e) {
      err.textContent = authErrorMessage(e);
    }
  }

  var resendUntil = 0;
  var resendTimer = null;
  var resendBusy = false;

  function authErrorMessage(err) {
    var status = err && (err.status || err.code || "");
    var m = String((err && (err.message || err.error_description)) || err || "");
    if (global.ReceiptlyErrors && ReceiptlyErrors.report) {
      ReceiptlyErrors.report(("auth " + status + " " + m).replace(/https?:\/\/\S+/g, "[url]").slice(0, 160), "auth");
    }
    if (/rate limit|too many/i.test(m)) return "Too many attempts. Please wait a moment and try again.";
    if (/Failed to fetch|NetworkError|network/i.test(m)) return "Unable to reach Receipt Pilot right now. Check your connection and try again.";
    if (/redirect|not allowed/i.test(m)) return "The reset link could not be prepared. Check the site address and try again.";
    if (/invalid email|email address/i.test(m)) return "Enter a valid email address.";
    if (global.ReceiptlyCloud && ReceiptlyCloud.friendlyError) return ReceiptlyCloud.friendlyError(err);
    return "Unable to complete that right now. Please try again.";
  }

  async function resendVerify() {
    var err = document.getElementById("verifyError");
    var ok = document.getElementById("verifyOk");
    var btn = document.getElementById("resendVerify");
    err.textContent = "";
    ok.textContent = "";
    if (resendBusy || Date.now() < resendUntil) {
      err.textContent = "Please wait before requesting another email.";
      return;
    }
    var email = pendingVerifyEmail || (document.getElementById("accEmail") && document.getElementById("accEmail").value) ||
      (document.getElementById("loginEmail") && document.getElementById("loginEmail").value) || "";
    email = String(email).trim();
    if (!email) {
      err.textContent = "Enter your email on the login screen first.";
      return;
    }
    resendBusy = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Sending…";
    }
    try {
      var sb = await ensureClient();
      if (!sb) {
        err.textContent = notConnectedMessage();
        return;
      }
      var result = await sb.auth.resend({
        type: "signup",
        email: email,
        options: { emailRedirectTo: authRedirect("/") }
      });
      if (result.error) throw result.error;
      ok.textContent = "Confirmation email sent. Check your inbox and spam folder.";
      if (global.ReceiptlyUI) ReceiptlyUI.toast("Confirmation email sent.");
      startResendCooldown();
    } catch (e) {
      err.textContent = authErrorMessage(e);
    } finally {
      resendBusy = false;
      if (btn && Date.now() >= resendUntil) {
        btn.disabled = false;
        btn.textContent = "Resend confirmation email";
      }
    }
  }

  function startResendCooldown() {
    var btn = document.getElementById("resendVerify");
    resendUntil = Date.now() + 60000;
    if (resendTimer) clearInterval(resendTimer);
    function tick() {
      var left = Math.ceil((resendUntil - Date.now()) / 1000);
      if (!btn) return;
      if (left <= 0) {
        btn.disabled = false;
        btn.textContent = "Resend confirmation email";
        clearInterval(resendTimer);
        resendTimer = null;
        return;
      }
      btn.disabled = true;
      btn.textContent = "Resend available in " + left + "s";
    }
    tick();
    resendTimer = setInterval(tick, 1000);
  }

  function authCallbackMessage() {
    var hash = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
    var query = new URLSearchParams(location.search || "");
    var code = hash.get("error_code") || query.get("error_code") || "";
    var desc = hash.get("error_description") || query.get("error_description") || "";
    var type = hash.get("type") || query.get("type") || "";
    if (/otp_expired|expired/i.test(code + " " + desc)) {
      return "This email link has expired. Request a new verification or reset link and try again.";
    }
    if (hash.get("error") || query.get("error")) {
      return "This email link is invalid or has already been used.";
    }
    if (type === "signup" || type === "email" || type === "invite") {
      return "Email verified. You can continue in Receipt Pilot.";
    }
    return "";
  }

  function clearAuthParams() {
    if (!location.hash && !/[?&](error|error_code|type|access_token)=/.test(location.search)) return;
    history.replaceState(null, "", location.pathname + location.search.replace(/[?&](error|error_code|error_description|type|access_token|refresh_token)=[^&]*/g, "").replace(/[?&]$/, ""));
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }

  function updateChip(text, sticky) {
    var chip = document.getElementById("syncChip");
    if (!chip) return;
    if (!text) {
      chip.hidden = true;
      return;
    }
    chip.hidden = false;
    chip.textContent = text;
    if (!sticky) {
      setTimeout(function () { if (chip.textContent === text) chip.hidden = true; }, 4000);
    }
  }

  function bind() {
    ensureModals();
    document.getElementById("signupForm").addEventListener("submit", register);
    document.getElementById("loginForm").addEventListener("submit", login);
    document.getElementById("forgotForm").addEventListener("submit", sendReset);
    document.getElementById("showSignup").addEventListener("click", function () { showPanel("signupPanel"); });
    document.getElementById("showLogin").addEventListener("click", function () { showPanel("loginPanel"); });
    document.getElementById("forgotPass").addEventListener("click", function () {
      var fe = document.getElementById("forgotEmail");
      var le = document.getElementById("loginEmail");
      if (fe && le) fe.value = le.value;
      showPanel("forgotPanel");
    });
    document.getElementById("forgotToLogin").addEventListener("click", function () { showPanel("loginPanel"); });
    document.getElementById("verifyToLogin").addEventListener("click", function () { showPanel("loginPanel"); });
    document.getElementById("resendVerify").addEventListener("click", resendVerify);
    document.getElementById("copyVerifyEmail").addEventListener("click", copyVerifyEmail);
    document.getElementById("authClose").addEventListener("click", function () { show("authDialog", false); });
    var doLogout = document.getElementById("doLogout");
    if (doLogout) doLogout.addEventListener("click", logout);
    var others = document.getElementById("signOutOthers");
    if (others) others.addEventListener("click", signOutOthers);
    var delAcc = document.getElementById("deleteAccount");
    if (delAcc) delAcc.addEventListener("click", deleteOwnAccount);
    var cancelDel = document.getElementById("cancelAccountDeletion");
    if (cancelDel) cancelDel.addEventListener("click", cancelAccountDeletion);
    document.getElementById("authDialog").addEventListener("click", function (e) {
      if (e.target.id === "authDialog") show("authDialog", false);
    });
    document.body.addEventListener("click", function (e) {
      var tog = e.target.closest("[data-pw]");
      if (tog) {
        var input = document.getElementById(tog.getAttribute("data-pw"));
        if (input) {
          var showPw = input.type === "password";
          input.type = showPw ? "text" : "password";
          tog.textContent = showPw ? "Hide" : "Show";
        }
        return;
      }
      var logoutBtn = e.target.closest("[data-logout]");
      if (logoutBtn) {
        e.preventDefault();
        logout();
        return;
      }
      var loginBtn = e.target.closest("[data-open-login]");
      if (loginBtn) {
        e.preventDefault();
        if (userId()) openAccountPanel();
        else showPanel("loginPanel");
      }
    });
    var claimYes = document.getElementById("claimYes");
    if (claimYes) claimYes.addEventListener("click", function () { claimLocal(true); });
    var claimNo = document.getElementById("claimNo");
    if (claimNo) claimNo.addEventListener("click", function () { claimLocal(false); });

    window.addEventListener("storage", function (e) {
      if (!e || e.key !== "receiptly_auth_event") return;
      if (e.newValue && String(e.newValue).indexOf("out:") === 0) {
        sessionUser = null;
        claimAskedFor = null;
        paintAccountButtons();
        if (global.ReceiptlyStorage && ReceiptlyStorage.setMeta) {
          ReceiptlyStorage.setMeta("lastUserId", null);
        }
        try { document.dispatchEvent(new CustomEvent("receiptly-auth-change")); } catch (err) { /* ignore */ }
      }
    });

    var sessionCheckBusy = false;
    function remoteSessionRevoked(err) {
      var m = String((err && (err.message || err.code || err.error_description)) || "");
      if (/Failed to fetch|NetworkError|network|offline|timeout/i.test(m)) return false;
      return /refresh_token|Invalid Refresh Token|session_not_found|Auth session missing|not authenticated|invalid jwt|jwt expired/i.test(m);
    }
    async function validateRemoteSession() {
      if (sessionCheckBusy || !sessionUser) return;
      var sb = await ensureClient();
      if (!sb) return;
      sessionCheckBusy = true;
      try {
        var res = await sb.auth.getUser();
        if (res && res.error && remoteSessionRevoked(res.error)) {
          onSignedOut();
          return;
        }
        if (res && !res.error && !(res.data && res.data.user) && sessionUser) {
          onSignedOut();
        }
      } catch (e) {
        if (remoteSessionRevoked(e)) onSignedOut();
      } finally {
        sessionCheckBusy = false;
      }
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") validateRemoteSession();
    });
    window.addEventListener("online", function () {
      updateChip("Back online — syncing...");
      validateRemoteSession();
      if (global.ReceiptlySync) ReceiptlySync.sync();
    });
    window.addEventListener("offline", function () {
      updateChip("Offline — Changes saved on this device", true);
    });
    if (!navigator.onLine) updateChip("Offline — Changes saved on this device", true);

    ensureClient().then(function (sb) {
      paintAccountButtons();
      var callbackMessage = authCallbackMessage();
      if (callbackMessage && global.ReceiptlyUI && ReceiptlyUI.toast) ReceiptlyUI.toast(callbackMessage);
      clearAuthParams();
      if (!sb) {
        readyResolve();
        return;
      }
      sb.auth.onAuthStateChange(function (event, session) {
        if (event === "PASSWORD_RECOVERY" || event === "TOKEN_REFRESHED") return;
        if (event === "INITIAL_SESSION") return;
        if (session && session.user) {
          onSignedIn(session.user).then(function () { readyResolve(); });
        } else if (event === "SIGNED_OUT") {
          onSignedOut();
          readyResolve();
        }
      });
      sb.auth.getSession().then(function (res) {
        if (res.data && res.data.session && res.data.session.user) {
          return onSignedIn(res.data.session.user);
        }
        onSignedOut();
      }).finally(function () { readyResolve(); });
    });
  }

  document.addEventListener("DOMContentLoaded", bind);

  global.ReceiptlyAccount = {
    ready: ready,
    token: token,
    user: user,
    userId: userId,
    logout: logout,
    showLogin: function () { ensureModals(); showPanel("loginPanel"); },
    showSignup: function () { ensureModals(); showPanel("signupPanel"); },
    trialExpired: trialExpired,
    updateChip: updateChip
  };
})(window);
