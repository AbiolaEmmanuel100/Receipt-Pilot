(function () {
  "use strict";

  function fmt(ts) {
    if (!ts) return "—";
    return String(ts).replace("T", " ").slice(0, 16);
  }

  function show(msg, isErr) {
    var el = document.getElementById("adminStatus");
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    el.className = isErr ? "error" : "hint";
  }

  function hideTable() {
    var table = document.getElementById("adminTableWrap");
    if (table) table.hidden = true;
  }

  function needLogin() {
    hideTable();
    show("Please log in to Receipt Pilot first.", true);
  }

  function deny() {
    hideTable();
    show("You do not have permission to access this page.", true);
  }

  function renderRows(rows) {
    var tbody = document.getElementById("adminBody");
    var wrap = document.getElementById("adminTableWrap");
    if (wrap) wrap.hidden = false;
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5">No pending deletion requests.</td></tr>';
      show("No pending requests.", false);
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      var email = String(r.email || "—").replace(/</g, "");
      var biz = String(r.business_name || "—").replace(/</g, "");
      return "<tr><td>" + email + "</td><td>" + biz +
        "</td><td>" + fmt(r.deletion_requested_at) + "</td><td>" + fmt(r.purge_after) +
        "</td><td>Pending</td></tr>";
    }).join("");
    var st = document.getElementById("adminStatus");
    if (st) st.hidden = true;
  }

  function waitForSession(client) {
    return new Promise(function (resolve) {
      var settled = false;
      function done(session) {
        if (settled) return;
        settled = true;
        resolve(session || null);
      }
      client.auth.getSession().then(function (res) {
        var session = res && res.data && res.data.session;
        if (session) done(session);
      }).catch(function () { /* wait for event */ });
      var sub = client.auth.onAuthStateChange(function (event, session) {
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "SIGNED_OUT") {
          if (sub && sub.data && sub.data.subscription && sub.data.subscription.unsubscribe) {
            try { sub.data.subscription.unsubscribe(); } catch (e) { /* ignore */ }
          }
          done(session || null);
        }
      });
      setTimeout(function () {
        client.auth.getSession().then(function (res) {
          done(res && res.data && res.data.session);
        }).catch(function () { done(null); });
      }, 2500);
    });
  }

  async function loadRequests(client) {
    var res;
    try {
      res = await client.rpc("list_account_deletion_requests");
    } catch (e) {
      deny();
      return;
    }
    if (res.error) {
      deny();
      return;
    }
    renderRows(res.data || []);
  }

  async function boot() {
    if (!window.ReceiptlyCloud || !ReceiptlyCloud.ready) {
      needLogin();
      return;
    }
    var client;
    try {
      client = await ReceiptlyCloud.ready();
    } catch (e) {
      needLogin();
      return;
    }
    if (!client) {
      needLogin();
      return;
    }
    var session = await waitForSession(client);
    if (!session) {
      needLogin();
      return;
    }
    await loadRequests(client);
  }

  document.addEventListener("DOMContentLoaded", function () {
    boot();
  });
})();
