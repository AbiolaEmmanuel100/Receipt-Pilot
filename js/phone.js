(function (global) {
  "use strict";

  // Self-contained country calling codes. No external library.
  // Flag is derived from ISO2. Dial codes are the international calling code
  // without a leading +. Shared codes (for example +1) are disambiguated by ISO.
  var RAW = [
    "AF|Afghanistan|93", "AL|Albania|355", "DZ|Algeria|213", "AS|American Samoa|1",
    "AD|Andorra|376", "AO|Angola|244", "AI|Anguilla|1", "AG|Antigua and Barbuda|1",
    "AR|Argentina|54", "AM|Armenia|374", "AW|Aruba|297", "AU|Australia|61",
    "AT|Austria|43", "AZ|Azerbaijan|994", "BS|Bahamas|1", "BH|Bahrain|973",
    "BD|Bangladesh|880", "BB|Barbados|1", "BY|Belarus|375", "BE|Belgium|32",
    "BZ|Belize|501", "BJ|Benin|229", "BM|Bermuda|1", "BT|Bhutan|975",
    "BO|Bolivia|591", "BA|Bosnia and Herzegovina|387", "BW|Botswana|267",
    "BR|Brazil|55", "IO|British Indian Ocean Territory|246", "VG|British Virgin Islands|1",
    "BN|Brunei|673", "BG|Bulgaria|359", "BF|Burkina Faso|226", "BI|Burundi|257",
    "KH|Cambodia|855", "CM|Cameroon|237", "CA|Canada|1", "CV|Cape Verde|238",
    "KY|Cayman Islands|1", "CF|Central African Republic|236", "TD|Chad|235",
    "CL|Chile|56", "CN|China|86", "CO|Colombia|57", "KM|Comoros|269",
    "CG|Congo|242", "CD|Congo (DRC)|243", "CK|Cook Islands|682", "CR|Costa Rica|506",
    "CI|Côte d'Ivoire|225", "HR|Croatia|385", "CU|Cuba|53", "CW|Curaçao|599",
    "CY|Cyprus|357", "CZ|Czechia|420", "DK|Denmark|45", "DJ|Djibouti|253",
    "DM|Dominica|1", "DO|Dominican Republic|1", "EC|Ecuador|593", "EG|Egypt|20",
    "SV|El Salvador|503", "GQ|Equatorial Guinea|240", "ER|Eritrea|291",
    "EE|Estonia|372", "SZ|Eswatini|268", "ET|Ethiopia|251", "FK|Falkland Islands|500",
    "FO|Faroe Islands|298", "FJ|Fiji|679", "FI|Finland|358", "FR|France|33",
    "GF|French Guiana|594", "PF|French Polynesia|689", "GA|Gabon|241",
    "GM|Gambia|220", "GE|Georgia|995", "DE|Germany|49", "GH|Ghana|233",
    "GI|Gibraltar|350", "GR|Greece|30", "GL|Greenland|299", "GD|Grenada|1",
    "GP|Guadeloupe|590", "GU|Guam|1", "GT|Guatemala|502", "GG|Guernsey|44",
    "GN|Guinea|224", "GW|Guinea-Bissau|245", "GY|Guyana|592", "HT|Haiti|509",
    "HN|Honduras|504", "HK|Hong Kong|852", "HU|Hungary|36", "IS|Iceland|354",
    "IN|India|91", "ID|Indonesia|62", "IR|Iran|98", "IQ|Iraq|964",
    "IE|Ireland|353", "IM|Isle of Man|44", "IL|Israel|972", "IT|Italy|39",
    "JM|Jamaica|1", "JP|Japan|81", "JE|Jersey|44", "JO|Jordan|962",
    "KZ|Kazakhstan|7", "KE|Kenya|254", "KI|Kiribati|686", "XK|Kosovo|383",
    "KW|Kuwait|965", "KG|Kyrgyzstan|996", "LA|Laos|856", "LV|Latvia|371",
    "LB|Lebanon|961", "LS|Lesotho|266", "LR|Liberia|231", "LY|Libya|218",
    "LI|Liechtenstein|423", "LT|Lithuania|370", "LU|Luxembourg|352",
    "MO|Macao|853", "MG|Madagascar|261", "MW|Malawi|265", "MY|Malaysia|60",
    "MV|Maldives|960", "ML|Mali|223", "MT|Malta|356", "MH|Marshall Islands|692",
    "MQ|Martinique|596", "MR|Mauritania|222", "MU|Mauritius|230", "YT|Mayotte|262",
    "MX|Mexico|52", "FM|Micronesia|691", "MD|Moldova|373", "MC|Monaco|377",
    "MN|Mongolia|976", "ME|Montenegro|382", "MS|Montserrat|1", "MA|Morocco|212",
    "MZ|Mozambique|258", "MM|Myanmar|95", "NA|Namibia|264", "NR|Nauru|674",
    "NP|Nepal|977", "NL|Netherlands|31", "NC|New Caledonia|687", "NZ|New Zealand|64",
    "NI|Nicaragua|505", "NE|Niger|227", "NG|Nigeria|234", "NU|Niue|683",
    "NF|Norfolk Island|672", "KP|North Korea|850", "MK|North Macedonia|389",
    "MP|Northern Mariana Islands|1", "NO|Norway|47", "OM|Oman|968", "PK|Pakistan|92",
    "PW|Palau|680", "PS|Palestine|970", "PA|Panama|507", "PG|Papua New Guinea|675",
    "PY|Paraguay|595", "PE|Peru|51", "PH|Philippines|63", "PL|Poland|48",
    "PT|Portugal|351", "PR|Puerto Rico|1", "QA|Qatar|974", "RE|Réunion|262",
    "RO|Romania|40", "RU|Russia|7", "RW|Rwanda|250", "BL|Saint Barthélemy|590",
    "SH|Saint Helena|290", "KN|Saint Kitts and Nevis|1", "LC|Saint Lucia|1",
    "MF|Saint Martin|590", "PM|Saint Pierre and Miquelon|508",
    "VC|Saint Vincent and the Grenadines|1", "WS|Samoa|685", "SM|San Marino|378",
    "ST|São Tomé and Príncipe|239", "SA|Saudi Arabia|966", "SN|Senegal|221",
    "RS|Serbia|381", "SC|Seychelles|248", "SL|Sierra Leone|232", "SG|Singapore|65",
    "SX|Sint Maarten|1", "SK|Slovakia|421", "SI|Slovenia|386", "SB|Solomon Islands|677",
    "SO|Somalia|252", "ZA|South Africa|27", "KR|South Korea|82", "SS|South Sudan|211",
    "ES|Spain|34", "LK|Sri Lanka|94", "SD|Sudan|249", "SR|Suriname|597",
    "SE|Sweden|46", "CH|Switzerland|41", "SY|Syria|963", "TW|Taiwan|886",
    "TJ|Tajikistan|992", "TZ|Tanzania|255", "TH|Thailand|66", "TL|Timor-Leste|670",
    "TG|Togo|228", "TK|Tokelau|690", "TO|Tonga|676", "TT|Trinidad and Tobago|1",
    "TN|Tunisia|216", "TR|Turkey|90", "TM|Turkmenistan|993", "TC|Turks and Caicos|1",
    "TV|Tuvalu|688", "UG|Uganda|256", "UA|Ukraine|380", "AE|United Arab Emirates|971",
    "GB|United Kingdom|44", "US|United States|1", "UY|Uruguay|598", "UZ|Uzbekistan|998",
    "VU|Vanuatu|678", "VA|Vatican City|39", "VE|Venezuela|58", "VN|Vietnam|84",
    "VI|U.S. Virgin Islands|1", "YE|Yemen|967", "ZM|Zambia|260", "ZW|Zimbabwe|263"
  ];

  var COUNTRIES = RAW.map(function (line) {
    var p = line.split("|");
    return { iso: p[0], name: p[1], dial: p[2] };
  });

  var BY_ISO = {};
  COUNTRIES.forEach(function (c) { BY_ISO[c.iso] = c; });

  var DIAL_SORTED = COUNTRIES.slice().sort(function (a, b) {
    return b.dial.length - a.dial.length || a.name.localeCompare(b.name);
  });

  var PRIMARY_DIAL = {
    "1": "US", "7": "RU", "39": "IT", "44": "GB", "47": "NO", "61": "AU",
    "212": "MA", "262": "RE", "290": "SH", "358": "FI", "590": "GP", "599": "CW"
  };

  // Safe configurable default. Empty means no country is forced.
  // Currency is only used as a suggestion when a field is empty.
  var DEFAULT_ISO = "";
  var CURRENCY_ISO = { NGN: "NG", GBP: "GB", USD: "US", GHS: "GH", KES: "KE", ZAR: "ZA", EUR: "DE", CAD: "CA", AUD: "AU", INR: "IN" };

  function flag(iso) {
    if (!iso || iso.length !== 2) return "";
    var A = 0x1F1E6;
    return String.fromCodePoint(A + iso.charCodeAt(0) - 65, A + iso.charCodeAt(1) - 65);
  }

  function digitsOnly(s) {
    return String(s || "").replace(/\D+/g, "");
  }

  function countryByIso(iso) {
    return iso ? BY_ISO[String(iso).toUpperCase()] || null : null;
  }

  function matchDial(digits) {
    var i, c, first = null;
    for (i = 0; i < DIAL_SORTED.length; i++) {
      c = DIAL_SORTED[i];
      if (digits.indexOf(c.dial) === 0) {
        first = c;
        break;
      }
    }
    if (!first) return null;
    var preferred = PRIMARY_DIAL[first.dial];
    if (preferred && BY_ISO[preferred]) return BY_ISO[preferred];
    return first;
  }

  function stripTrunkZero(national) {
    var d = digitsOnly(national);
    if (d.length > 1 && d.charAt(0) === "0") d = d.replace(/^0+/, "");
    return d;
  }

  function analyze(raw, iso) {
    var original = String(raw || "").trim();
    var selected = countryByIso(iso);
    var nationalInput = original;
    var inferred = null;
    var alreadyIntl = false;

    if (/^\s*\+/.test(original) || /^\s*00/.test(original)) {
      alreadyIntl = true;
      var intlDigits = digitsOnly(original.replace(/^\s*00/, ""));
      inferred = matchDial(intlDigits);
      if (inferred) {
        selected = selected || inferred;
        nationalInput = intlDigits.slice(inferred.dial.length);
      }
    } else if (selected) {
      var bare = digitsOnly(original);
      if (bare.indexOf(selected.dial) === 0 && bare.length > selected.dial.length + 5) {
        alreadyIntl = true;
        nationalInput = bare.slice(selected.dial.length);
      }
    }

    var national = stripTrunkZero(nationalInput);
    var e164 = "";
    var valid = false;
    var incomplete = false;
    var message = "";

    if (!original) {
      message = "";
    } else if (/[a-z]/i.test(original)) {
      message = "Phone numbers can only contain digits, spaces, and a leading +.";
    } else if (!selected) {
      incomplete = true;
      message = "Choose a country calling code. This number is shown as entered and has not been changed.";
    } else if (!/^\d+$/.test(national) || national.length < 6) {
      incomplete = true;
      message = "Enter the national number. It is not complete enough to format.";
    } else if ((selected.dial + national).length > 15) {
      message = "This number is too long to be a valid international number.";
    } else if ((selected.dial + national).length < 8) {
      incomplete = true;
      message = "This number looks incomplete for " + selected.name + ".";
    } else {
      e164 = "+" + selected.dial + national;
      valid = true;
      message = alreadyIntl ? "International format recognised." : "";
    }

    return {
      iso: selected ? selected.iso : "",
      country: selected,
      national: nationalInput,
      nationalDigits: national,
      e164: e164,
      valid: valid,
      incomplete: incomplete,
      message: message,
      display: valid ? e164 : original
    };
  }

  function whatsappDigits(raw, iso) {
    var info = analyze(raw, iso);
    if (info.valid) return info.e164.replace(/\D+/g, "");
    var d = digitsOnly(raw);
    if (/^\s*\+/.test(String(raw || "")) && d.length >= 8 && d.length <= 15) return d;
    return "";
  }

  function suggestedIso(currency) {
    if (DEFAULT_ISO && BY_ISO[DEFAULT_ISO]) return DEFAULT_ISO;
    var c = String(currency || "").toUpperCase();
    return CURRENCY_ISO[c] || "";
  }

  function labelFor(c) {
    if (!c) return "Country";
    return flag(c.iso) + " " + c.name + " (+" + c.dial + ")";
  }

  function shortLabel(c) {
    if (!c) return "Country";
    return flag(c.iso) + " +" + c.dial;
  }

  var widgets = [];

  function closeAll(except) {
    widgets.forEach(function (w) {
      if (w !== except) w.close();
    });
  }

  function enhance(input, opts) {
    if (!input || input.dataset.phoneReady) return;
    input.dataset.phoneReady = "1";
    opts = opts || {};

    var wrap = document.createElement("div");
    wrap.className = "phone-field";
    input.parentNode.insertBefore(wrap, input);

    var row = document.createElement("div");
    row.className = "phone-row";
    wrap.appendChild(row);

    var cc = document.createElement("div");
    cc.className = "phone-cc";
    row.appendChild(cc);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "phone-cc-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Country calling code");
    cc.appendChild(btn);

    var panel = document.createElement("div");
    panel.className = "phone-cc-panel";
    panel.hidden = true;
    cc.appendChild(panel);

    var search = document.createElement("input");
    search.type = "search";
    search.className = "phone-cc-search";
    search.placeholder = "Search country or code";
    search.setAttribute("aria-label", "Search countries");
    panel.appendChild(search);

    var list = document.createElement("ul");
    list.className = "phone-cc-list";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Countries");
    panel.appendChild(list);

    row.appendChild(input);
    input.classList.add("phone-national");
    input.setAttribute("inputmode", "tel");
    input.setAttribute("autocomplete", "tel-national");

    var hint = document.createElement("p");
    hint.className = "phone-hint";
    hint.setAttribute("role", "status");
    wrap.appendChild(hint);

    var state = { iso: "", open: false, active: -1 };

    function paintButton() {
      var c = countryByIso(state.iso);
      btn.textContent = shortLabel(c);
      btn.title = c ? labelFor(c) : "Choose a country";
    }

    function renderList(q) {
      var query = String(q || "").trim().toLowerCase();
      var qDigits = query.replace(/\D+/g, "");
      list.innerHTML = "";
      var shown = 0;
      COUNTRIES.forEach(function (c) {
        var hay = (c.name + " " + c.iso + " +" + c.dial + " " + c.dial).toLowerCase();
        if (query && hay.indexOf(query) === -1 && (!qDigits || c.dial.indexOf(qDigits) === -1)) return;
        var li = document.createElement("li");
        li.setAttribute("role", "option");
        li.dataset.iso = c.iso;
        li.textContent = flag(c.iso) + "  " + c.name + "  (+" + c.dial + ")";
        if (c.iso === state.iso) li.setAttribute("aria-selected", "true");
        li.addEventListener("mousedown", function (e) {
          e.preventDefault();
          choose(c.iso);
        });
        list.appendChild(li);
        shown++;
      });
      if (!shown) {
        var empty = document.createElement("li");
        empty.className = "phone-cc-empty";
        empty.textContent = "No matching country";
        list.appendChild(empty);
      }
      state.active = -1;
    }

    function open() {
      closeAll(widget);
      state.open = true;
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      renderList("");
      search.value = "";
      setTimeout(function () { search.focus(); }, 0);
    }

    function close() {
      state.open = false;
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }

    function choose(iso) {
      state.iso = iso || "";
      paintButton();
      close();
      refreshHint();
      input.focus();
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function refreshHint() {
      var info = analyze(input.value, state.iso);
      hint.textContent = info.message || (info.valid ? info.e164 : "");
      hint.classList.toggle("is-ok", !!info.valid);
      hint.classList.toggle("is-warn", !!info.incomplete || (!!info.message && !info.valid));
    }

    function setFrom(raw, iso) {
      var info = analyze(raw, iso);
      state.iso = info.iso || iso || state.iso || "";
      if (info.country && ( /^\s*\+/.test(String(raw || "")) || /^\s*00/.test(String(raw || "")) )) {
        input.value = info.nationalDigits || "";
      } else if (info.valid && info.country) {
        input.value = info.nationalDigits || "";
      } else {
        input.value = raw || "";
        if (!iso && !info.iso) state.iso = "";
      }
      if (iso) state.iso = iso;
      if (!state.iso && info.iso) state.iso = info.iso;
      paintButton();
      refreshHint();
    }

    btn.addEventListener("click", function () {
      if (state.open) close();
      else open();
    });
    search.addEventListener("input", function () { renderList(search.value); });
    search.addEventListener("keydown", function (e) {
      var items = list.querySelectorAll("[data-iso]");
      if (e.key === "Escape") { close(); btn.focus(); e.preventDefault(); return; }
      if (e.key === "ArrowDown") {
        state.active = Math.min(items.length - 1, state.active + 1);
        if (items[state.active]) items[state.active].focus && items[state.active].scrollIntoView({ block: "nearest" });
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        state.active = Math.max(0, state.active - 1);
        e.preventDefault();
      } else if (e.key === "Enter") {
        e.preventDefault();
        var pick = state.active >= 0 ? items[state.active] : items[0];
        if (pick) choose(pick.dataset.iso);
      }
    });
    list.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { close(); search.focus(); }
    });
    input.addEventListener("input", refreshHint);
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) close();
    });

    var widget = {
      input: input,
      close: close,
      setFrom: setFrom,
      getIso: function () { return state.iso; },
      setIso: function (iso) { state.iso = iso || ""; paintButton(); refreshHint(); },
      analyze: function () { return analyze(input.value, state.iso); }
    };
    widgets.push(widget);
    paintButton();
    refreshHint();
    return widget;
  }

  function widgetFor(input) {
    var i;
    for (i = 0; i < widgets.length; i++) if (widgets[i].input === input) return widgets[i];
    return null;
  }

  function mount(input, opts) {
    return enhance(input, opts);
  }

  function setValue(input, raw, iso) {
    var w = widgetFor(input) || enhance(input);
    if (!w) return;
    w.setFrom(raw || "", iso || "");
  }

  function getValue(input) {
    var w = widgetFor(input);
    if (!w) return analyze(input && input.value, "");
    return w.analyze();
  }

  function clearValue(input, keepCountry) {
    var w = widgetFor(input);
    if (input) input.value = "";
    if (w && !keepCountry) w.setIso("");
    if (w) w.setFrom("", keepCountry ? w.getIso() : "");
  }

  global.ReceiptlyPhone = {
    countries: COUNTRIES,
    flag: flag,
    analyze: analyze,
    whatsappDigits: whatsappDigits,
    suggestedIso: suggestedIso,
    mount: mount,
    setValue: setValue,
    getValue: getValue,
    clearValue: clearValue,
    widgetFor: widgetFor
  };
})(typeof window !== "undefined" ? window : globalThis);
