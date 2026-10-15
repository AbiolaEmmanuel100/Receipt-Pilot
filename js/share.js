(function (global) {
  "use strict";

  var current = null;
  var imageBlob = null;
  var imageUrl = null;
  var capturing = false;

  function makeToken() {
    var alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
    var bytes = new Uint8Array(10);
    if (global.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (var i = 0; i < 10; i++) bytes[i] = Math.floor(Math.random() * 256);
    var out = "";
    for (var j = 0; j < bytes.length; j++) out += alphabet[bytes[j] % alphabet.length];
    return out;
  }

  async function ensureToken(record) {
    if (!record) return record;
    if (record.shareToken && String(record.shareToken).length >= 8) return record;
    record.shareToken = makeToken();
    record.updatedAt = new Date().toISOString();
    record.syncStatus = "pending";
    if (global.ReceiptlyStorage && ReceiptlyStorage.saveReceipt) {
      await ReceiptlyStorage.saveReceipt(record);
    }
    if (global.ReceiptlySync && ReceiptlySync.pushOne) {
      try { await ReceiptlySync.pushOne(record); } catch (e) { /* offline ok */ }
    }
    return record;
  }

  function shareUrl(record) {
    var origin = location.origin && location.origin !== "null" ? location.origin : "";
    var path = location.pathname.replace(/[^/]+$/, "") + "r.html";
    return origin + path + "?t=" + encodeURIComponent(record.shareToken);
  }

  function digits(phone) {
    var d = String(phone || "").replace(/\D+/g, "");
    if (d.length === 11 && d.charAt(0) === "0") d = "234" + d.slice(1);
    return d;
  }

  function caption(record) {
    var biz = (record.business && record.business.name) || "Receipt Pilot";
    return "Receipt " + (record.number || "") + " from " + biz;
  }

  function fileName(record) {
    return String(record.number || "receipt").replace(/[^\w.-]+/g, "_") + ".png";
  }

  function waitImages(root) {
    var imgs = root.querySelectorAll("img");
    return Promise.all(Array.prototype.map.call(imgs, function (img) {
      if (img.complete) return Promise.resolve();
      return new Promise(function (res) {
        img.onload = img.onerror = function () { res(); };
      });
    }));
  }

  async function captureReceipt(record) {
    if (!window.html2canvas || !global.ReceiptlyReceipt) {
      throw new Error("capture");
    }
    var host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:absolute;left:-10000px;top:0;width:420px;background:#fff;padding:0;margin:0;";
    var paper = document.createElement("div");
    host.appendChild(paper);
    document.body.appendChild(host);
    ReceiptlyReceipt.render(record, paper);
    await waitImages(host);
    await new Promise(function (res) { requestAnimationFrame(function () { requestAnimationFrame(res); }); });
    var w = Math.max(paper.scrollWidth, paper.offsetWidth, 420);
    var h = Math.max(paper.scrollHeight, paper.offsetHeight);
    var canvas = await html2canvas(paper, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      width: w,
      height: h,
      windowWidth: w,
      windowHeight: h
    });
    document.body.removeChild(host);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error("blob"));
          return;
        }
        resolve({ blob: blob, url: URL.createObjectURL(blob) });
      }, "image/png");
    });
  }

  async function ensureImage() {
    if (imageBlob && imageUrl) return;
    capturing = true;
    setStatus("Preparing receipt image…", "");
    try {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      var shot = await captureReceipt(current);
      imageBlob = shot.blob;
      imageUrl = shot.url;
      var img = document.getElementById("shareImagePreview");
      var menuImg = document.getElementById("shareMenuPreview");
      [img, menuImg].forEach(function (el) {
        if (el) {
          el.src = imageUrl;
          el.hidden = false;
        }
      });
      setStatus("", "");
    } finally {
      capturing = false;
    }
  }

  function canShareFile() {
    try {
      var f = new File([new Blob(["x"], { type: "image/png" })], "t.png", { type: "image/png" });
      return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [f] }));
    } catch (e) {
      return false;
    }
  }

  function downloadImage() {
    if (!imageBlob || !current) return;
    var a = document.createElement("a");
    a.href = imageUrl;
    a.download = fileName(current);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function imageFile() {
    return new File([imageBlob], fileName(current), { type: "image/png" });
  }

  function ensureUi() {
    var stale = document.getElementById("shareDialog");
    if (stale && !document.getElementById("shareImagePreview")) {
      stale.parentNode.removeChild(stale);
    }
    if (document.getElementById("shareDialog")) return;
    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="save-dialog" id="shareDialog" hidden>' +
        '<div class="card share-card">' +
          "<h2>Send Receipt</h2>" +
          '<p class="hint" id="shareSub">How would you like to send it?</p>' +
          '<p class="hint">Receipt preview</p>' +
          '<div class="share-preview-wrap"><img id="shareMenuPreview" alt="Receipt preview" hidden></div>' +
          '<div id="shareMenu">' +
            '<button type="button" class="share-opt share-wa" data-share="wa">Send via WhatsApp</button>' +
            '<button type="button" class="share-opt" data-share="email">Send via Email</button>' +
            '<button type="button" class="share-opt" data-share="image">Download Image</button>' +
            '<button type="button" class="share-opt" data-share="pdf">Download PDF</button>' +
            '<button type="button" class="share-opt" data-share="link">Copy link</button>' +
            '<button type="button" class="share-opt" data-share="more">Share</button>' +
          "</div>" +
          '<div id="shareWa" hidden>' +
            '<div class="field"><label for="sharePhone">Customer WhatsApp number</label>' +
            '<input id="sharePhone" type="tel" inputmode="tel" placeholder="International number, e.g. +234…">'</div>' +
            '<p class="hint">Receipt preview</p>' +
            '<div class="share-preview-wrap"><img id="shareImagePreview" alt="Receipt preview" hidden></div>' +
            '<p class="hint" id="shareWaHint">The customer receives this receipt image, using the same design as Receipt Pilot.</p>' +
            '<p class="error" id="shareWaErr"></p>' +
            '<div class="actions-bar">' +
              '<button type="button" class="btn btn-primary" id="shareWaGo">Share/Send image</button>' +
              '<button type="button" class="btn btn-ghost" id="shareWaBack">Back</button>' +
            "</div>" +
          "</div>" +
          '<p class="ok" id="shareOk"></p>' +
          '<p class="error" id="shareErr"></p>' +
          '<p class="hint" style="text-align:center;margin-top:12px"><button type="button" class="btn btn-ghost btn-sm" id="shareClose">Close</button></p>' +
        "</div>" +
      "</div>";
    document.body.appendChild(wrap);

    document.getElementById("shareDialog").addEventListener("click", function (e) {
      if (e.target.id === "shareDialog") close();
      var opt = e.target.closest("[data-share]");
      if (opt) choose(opt.getAttribute("data-share"));
    });
    document.getElementById("shareClose").addEventListener("click", close);
    document.getElementById("shareWaBack").addEventListener("click", function () {
      document.getElementById("shareWa").hidden = true;
      document.getElementById("shareMenu").hidden = false;
      document.getElementById("shareSub").textContent = "How would you like to send it?";
    });
    document.getElementById("shareWaGo").addEventListener("click", openWhatsApp);
  }

  function setStatus(ok, err) {
    var o = document.getElementById("shareOk");
    var e = document.getElementById("shareErr");
    if (o) o.textContent = ok || "";
    if (e) e.textContent = err || "";
  }

  async function openSheet(record) {
    if (!record) {
      if (global.ReceiptlyUI) ReceiptlyUI.toast("Save the receipt first, then send it.", "error");
      return;
    }
    ensureUi();
    setStatus("", "");
    imageBlob = null;
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
      imageUrl = null;
    }
    current = await ensureToken(record);
    document.getElementById("shareMenu").hidden = false;
    document.getElementById("shareWa").hidden = true;
    document.getElementById("shareSub").textContent = "How would you like to send " + (current.number || "this receipt") + "?";
    var phoneEl = document.getElementById("sharePhone");
    if (phoneEl) {
      var stored = (current.customer && current.customer.phone) || "";
      var iso = (current.customer && current.customer.phoneCountry) || "";
      if (window.ReceiptlyPhone && ReceiptlyPhone.analyze) {
        var info = ReceiptlyPhone.analyze(stored, iso);
        phoneEl.value = info.valid ? info.e164 : stored;
      } else {
        phoneEl.value = stored;
      }
    }
    document.getElementById("shareDialog").hidden = false;
    var sub = document.getElementById("shareSub");
    if (sub) sub.textContent = "Generating receipt…";
    try {
      await ensureImage();
      if (sub) sub.textContent = "How would you like to send " + (current.number || "this receipt") + "?";
    } catch (e) {
      if (sub) sub.textContent = "How would you like to send " + (current.number || "this receipt") + "?";
    }
  }

  function close() {
    var d = document.getElementById("shareDialog");
    if (d) d.hidden = true;
  }

  async function choose(kind) {
    setStatus("", "");
    if (!current) return;
    current = await ensureToken(current);
    if (kind === "wa") {
      document.getElementById("shareMenu").hidden = true;
      document.getElementById("shareWa").hidden = false;
      document.getElementById("shareSub").textContent = "Send via WhatsApp";
      document.getElementById("shareWaErr").textContent = "";
      try {
        await ensureImage();
        document.getElementById("shareWaGo").textContent = canShareFile()
          ? "Share/Send image"
          : "Download image & open WhatsApp";
      } catch (e) {
        document.getElementById("shareWaErr").textContent = "Could not create the receipt image. Try Download PDF instead.";
      }
      return;
    }
    if (kind === "image") {
      try {
        await ensureImage();
        downloadImage();
        setStatus("Receipt downloaded", "");
      } catch (e) {
        setStatus("", "Could not create the receipt image.");
      }
      return;
    }
    if (kind === "email") {
      try {
        await ensureImage();
        if (canShareFile()) {
          await navigator.share({
            files: [imageFile()],
            title: caption(current),
            text: caption(current)
          });
          setStatus("Choose Email in the share menu, or attach the image if you already downloaded it.", "");
          return;
        }
        downloadImage();
        var to = (current.customer && current.customer.email) || "";
        var sub = encodeURIComponent(caption(current));
        var body = encodeURIComponent("Please find the receipt image in your downloads and attach it to this email.\n\n" + caption(current));
        location.href = "mailto:" + encodeURIComponent(to) + "?subject=" + sub + "&body=" + body;
        setStatus("Image downloaded. Attach that PNG to the email that just opened. Browsers cannot attach files to email automatically.", "");
      } catch (e) {
        if (e && e.name === "AbortError") return;
        setStatus("", "Could not prepare the receipt image for email.");
      }
      return;
    }
    if (kind === "pdf") {
      var el = document.getElementById("receiptPreview") || document.getElementById("viewPreview") || document.getElementById("shareReceiptEl");
      if (!el || !global.ReceiptlyPdf) {
        setStatus("", "PDF is not ready. Try Download PDF on the receipt.");
        return;
      }
      try {
        await ReceiptlyPdf.download(el, current.number || "receipt");
        setStatus("Receipt downloaded", "");
      } catch (e) {
        setStatus("", "PDF library is still loading. Try again.");
      }
      return;
    }
    if (kind === "link") {
      try {
        current = await ensureToken(current);
        var url = shareUrl(current);
        var copied = false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          try {
            await navigator.clipboard.writeText(url);
            copied = true;
          } catch (e1) { copied = false; }
        }
        if (!copied) {
          var ta = document.createElement("textarea");
          ta.value = url;
          ta.setAttribute("readonly", "readonly");
          ta.style.cssText = "position:fixed;left:-9999px;top:0";
          document.body.appendChild(ta);
          ta.select();
          try { copied = document.execCommand("copy"); } catch (e2) { copied = false; }
          document.body.removeChild(ta);
        }
        if (copied) setStatus("Link copied.", "");
        else setStatus("", "Could not copy the link. Select and copy it manually: " + url);
      } catch (e) {
        setStatus("", "Could not copy the link.");
      }
      return;
    }
    if (kind === "more") {
      try {
        await ensureImage();
        if (canShareFile()) {
          await navigator.share({
            files: [imageFile()],
            title: caption(current),
            text: caption(current)
          });
          setStatus("Shared.", "");
        } else if (navigator.share) {
          downloadImage();
          await navigator.share({ title: caption(current), text: caption(current) });
          setStatus("Image downloaded. Attach it from the share menu if your app allows files.", "");
        } else {
          downloadImage();
          setStatus("Image downloaded. This browser has no extra share menu.", "");
        }
      } catch (e) {
        if (e && e.name === "AbortError") return;
        setStatus("", "Sharing was cancelled or is not available.");
      }
    }
  }

  async function openWhatsApp() {
    var err = document.getElementById("shareWaErr");
    err.textContent = "";
    if (capturing) {
      err.textContent = "Still preparing the receipt image…";
      return;
    }
    var rawPhone = document.getElementById("sharePhone").value;
    var phone = "";
    if (window.ReceiptlyPhone && ReceiptlyPhone.whatsappDigits) {
      phone = ReceiptlyPhone.whatsappDigits(rawPhone, "");
    } else {
      phone = digits(rawPhone);
      if (phone.length < 10 || phone.length > 15) phone = "";
    }
    if (!phone) {
      err.textContent = "Enter a valid international number with a country code, for example +234… WhatsApp was not opened.";
      return;
    }
    try {
      await ensureImage();
    } catch (e) {
      err.textContent = "Could not create the receipt image.";
      return;
    }
    var note = caption(current);
    if (canShareFile()) {
      try {
        await navigator.share({
          files: [imageFile()],
          title: note,
          text: note
        });
        setStatus("Pick WhatsApp in the share list to send the receipt image. If WhatsApp is not listed, download the image and attach it in the chat.", "");
        if (window.ReceiptlyActivity) ReceiptlyActivity.log("receipt_shared", { number: current.number });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    downloadImage();
    window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent("Hello, here is your receipt (" + (current.number || "") + "). Please see the receipt image I am sending."), "_blank", "noopener");
    setStatus("Receipt image downloaded. WhatsApp opened — attach that PNG in the chat. Browsers cannot drop the file into WhatsApp automatically.", "");
  }

  global.ReceiptlyShare = {
    makeToken: makeToken,
    ensureToken: ensureToken,
    shareUrl: shareUrl,
    open: openSheet,
    downloadImage: async function (record) {
      if (!record) return;
      var shot = await captureReceipt(record);
      var a = document.createElement("a");
      a.href = shot.url;
      a.download = fileName(record);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(shot.url); }, 4000);
    }
  };
})(window);
