(function (global) {
  "use strict";

  var pending = null;
  var requireText = "";

  function toast(msg, type) {
    var el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = "toast show " + (type || "");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("show"); }, 3200);
  }

  function setupNav() {
    var toggle = document.getElementById("navToggle");
    var nav = document.getElementById("siteNav");
    if (!nav) return;
    if (toggle) {
      toggle.addEventListener("click", function () {
        var open = nav.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      });
    }
    var drops = Array.prototype.slice.call(nav.querySelectorAll(".nav-drop"));
    function closeDrops(except) {
      drops.forEach(function (drop) {
        if (drop !== except) {
          drop.classList.remove("open");
          var btn = drop.querySelector(".nav-drop-btn");
          if (btn) btn.setAttribute("aria-expanded", "false");
        }
      });
    }
    drops.forEach(function (drop) {
      var btn = drop.querySelector(".nav-drop-btn");
      if (!btn) return;
      btn.addEventListener("click", function (event) {
        event.stopPropagation();
        var open = !drop.classList.contains("open");
        closeDrops(open ? drop : null);
        drop.classList.toggle("open", open);
        btn.setAttribute("aria-expanded", String(open));
      });
      btn.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          drop.classList.remove("open");
          btn.setAttribute("aria-expanded", "false");
          btn.focus();
        }
      });
    });
    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        if (toggle) {
          nav.classList.remove("open");
          toggle.setAttribute("aria-expanded", "false");
          toggle.setAttribute("aria-label", "Open menu");
        }
        closeDrops(null);
      }
    });
    document.addEventListener("click", function (event) {
      if (!nav.contains(event.target) && event.target !== toggle) closeDrops(null);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeDrops(null);
        if (toggle && nav.classList.contains("open")) {
          nav.classList.remove("open");
          toggle.setAttribute("aria-expanded", "false");
          toggle.setAttribute("aria-label", "Open menu");
          toggle.focus();
        }
      }
    });
  }

  function ensureConfirm() {
    var el = document.getElementById("confirmDialog");
    if (el) return el;
    el = document.createElement("div");
    el.id = "confirmDialog";
    el.className = "save-dialog confirm-dialog";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "confirmTitle");
    el.innerHTML =
      '<div class="card confirm-card">' +
        '<button type="button" class="confirm-x" id="confirmClose" aria-label="Close">×</button>' +
        '<h2 id="confirmTitle"></h2>' +
        '<p id="confirmMessage"></p>' +
        '<div class="field" id="confirmTextWrap" hidden>' +
          '<label for="confirmText">Type DELETE to confirm</label>' +
          '<input type="text" id="confirmText" autocomplete="off">' +
        "</div>" +
        '<div class="confirm-actions">' +
          '<button type="button" class="btn btn-secondary" id="confirmCancel">Cancel</button>' +
          '<button type="button" class="btn btn-secondary" id="confirmExtra" hidden></button>' +
          '<button type="button" class="btn btn-primary" id="confirmOk">OK</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(el);
    el.addEventListener("click", function (e) {
      if (e.target === el) finish(false);
    });
    document.getElementById("confirmClose").addEventListener("click", function () { finish(false); });
    document.getElementById("confirmCancel").addEventListener("click", function () { finish(false); });
    document.getElementById("confirmOk").addEventListener("click", function () {
      if (requireText) {
        var typed = String(document.getElementById("confirmText").value || "").trim();
        if (typed !== requireText) {
          toast("Type " + requireText + " to confirm.", "error");
          document.getElementById("confirmText").focus();
          return;
        }
      }
      finish(true);
    });
    document.getElementById("confirmExtra").addEventListener("click", function () { finish("extra"); });
    return el;
  }

  function finish(result) {
    var el = document.getElementById("confirmDialog");
    if (el) el.hidden = true;
    var fn = pending;
    pending = null;
    if (fn) fn(result);
  }

  function confirmBox(opts) {
    opts = opts || {};
    ensureConfirm();
    return new Promise(function (resolve) {
      if (pending) pending(false);
      pending = resolve;
      document.getElementById("confirmTitle").textContent = opts.title || "Please confirm";
      document.getElementById("confirmMessage").textContent = opts.message || "";
      var ok = document.getElementById("confirmOk");
      var extra = document.getElementById("confirmExtra");
      var wrap = document.getElementById("confirmTextWrap");
      var input = document.getElementById("confirmText");
      var cancel = document.getElementById("confirmCancel");
      ok.textContent = opts.confirmLabel || "Confirm";
      ok.className = "btn " + (opts.danger ? "btn-confirm-danger" : "btn-primary");
      cancel.textContent = opts.cancelLabel || "Cancel";
      requireText = opts.requireText || "";
      if (opts.extraLabel) {
        extra.hidden = false;
        extra.textContent = opts.extraLabel;
        extra.className = "btn " + (opts.extraDanger ? "btn-confirm-danger" : "btn-secondary");
      } else {
        extra.hidden = true;
      }
      if (requireText) {
        wrap.hidden = false;
        wrap.querySelector("label").textContent = "Type " + requireText + " to confirm";
        input.value = "";
      } else {
        wrap.hidden = true;
      }
      document.getElementById("confirmDialog").hidden = false;
      setTimeout(function () {
        if (requireText) input.focus();
        else document.getElementById("confirmCancel").focus();
      }, 20);
    });
  }

  async function withBusy(btn, label, fn) {
    if (!btn) return fn();
    if (btn.dataset.busy === "1") return;
    var prev = btn.textContent;
    btn.dataset.busy = "1";
    btn.disabled = true;
    if (label) btn.textContent = label;
    try {
      return await fn();
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
      delete btn.dataset.busy;
    }
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var el = document.getElementById("confirmDialog");
    if (el && !el.hidden) {
      e.preventDefault();
      finish(false);
    }
  });

  function setupPromo() {
    var root = document.getElementById("accountPromo");
    if (!root) return;
    var slides = Array.prototype.slice.call(root.querySelectorAll(".promo-slide"));
    var dotsWrap = document.getElementById("promoDots");
    var i = 0;
    var timer = null;
    var paused = false;

    function loggedIn() {
      return !!(window.ReceiptlyAccount && ReceiptlyAccount.userId && ReceiptlyAccount.userId());
    }

    function updateCtas() {
      if (loggedIn()) {
        root.hidden = true;
        return;
      }
      root.hidden = false;
      root.querySelectorAll("[data-promo-cta]").forEach(function (btn) {
        btn.textContent = "Create Free Account";
      });
    }

    function show(n) {
      i = (n + slides.length) % slides.length;
      slides.forEach(function (s, idx) {
        var on = idx === i;
        s.hidden = !on;
        s.classList.toggle("is-active", on);
      });
      if (dotsWrap) {
        Array.prototype.forEach.call(dotsWrap.children, function (d, idx) {
          d.classList.toggle("is-on", idx === i);
          d.setAttribute("aria-selected", idx === i ? "true" : "false");
        });
      }
    }

    function play() {
      clearInterval(timer);
      timer = setInterval(function () {
        if (!paused) show(i + 1);
      }, 5000);
    }

    slides.forEach(function (_, idx) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "promo-dot" + (idx === 0 ? " is-on" : "");
      b.setAttribute("aria-label", "Slide " + (idx + 1));
      b.addEventListener("click", function () { paused = true; show(idx); play(); });
      dotsWrap.appendChild(b);
    });

    var prev = document.getElementById("promoPrev");
    var next = document.getElementById("promoNext");
    if (prev) prev.addEventListener("click", function () { paused = true; show(i - 1); play(); });
    if (next) next.addEventListener("click", function () { paused = true; show(i + 1); play(); });

    root.addEventListener("mouseenter", function () { paused = true; });
    root.addEventListener("mouseleave", function () { paused = false; });
    root.addEventListener("focusin", function () { paused = true; });
    root.addEventListener("focusout", function () { paused = false; });

    var startX = 0;
    root.addEventListener("touchstart", function (e) {
      startX = e.changedTouches[0].clientX;
      paused = true;
    }, { passive: true });
    root.addEventListener("touchend", function (e) {
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1));
      play();
    }, { passive: true });

    root.addEventListener("click", function (e) {
      var cta = e.target.closest("[data-promo-cta]");
      if (!cta) return;
      if (loggedIn()) {
        location.href = "records.html";
        return;
      }
      if (window.ReceiptlyAccount && ReceiptlyAccount.showSignup) ReceiptlyAccount.showSignup();
    });

    updateCtas();
    if (window.ReceiptlyAccount && ReceiptlyAccount.ready) {
      ReceiptlyAccount.ready.then(updateCtas);
    }
    document.addEventListener("receiptly-auth-change", updateCtas);
    show(0);
    play();
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupNav();
    setupPromo();
  });

  global.ReceiptlyUI = { toast: toast, setupNav: setupNav, confirm: confirmBox, withBusy: withBusy };
})(window);
