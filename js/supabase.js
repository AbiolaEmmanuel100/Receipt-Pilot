(function (global) {
  "use strict";

  var client = null;
  var loading = null;
  var CDN = "https://cd(function (global) {
  "use strict";

  var client = null;
  var loading = null;
  var CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.min.js";

  function configured() {
    return !!(global.ReceiptlyConfig && typeof global.ReceiptlyConfig.isSupabaseConfigured === "function" &&
      global.ReceiptlyConfig.isSupabaseConfigured());
  }

  function findLib() {
    var lib = global.supabase;
    if (lib && typeof lib.createClient === "function") return lib;
    try {
      if (typeof supabase !== "undefined" && supabase && typeof supabase.createClient === "function") return supabase;
    } catch (e) { /* not in scope */ }
    return null;
  }

  function ensureLib() {
    var lib = findLib();
    if (lib) return Promise.resolve(lib);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = CDN;
      s.async = false;
      s.onload = function () {
        var found = findLib();
        if (found) resolve(found);
        else reject(new Error("supabase_lib_missing"));
      };
      s.onerror = function () { reject(new Error("supabase_lib_missing")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function buildClient(lib) {
    if (client) return client;
    if (!lib || typeof lib.createClient !== "function") return null;
    client = lib.createClient(
      String(global.ReceiptlyConfig.supabaseUrl).trim(),
      String(global.ReceiptlyConfig.supabaseAnonKey).trim(),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "receiptly-auth"
        }
      }
    );
    return client;
  }

  function getClient() {
    if (!configured()) return null;
    if (client) return client;
    return buildClient(findLib());
  }

  function ready() {
    if (!configured()) return Promise.resolve(null);
    if (client) return Promise.resolve(client);
    return ensureLib().then(function (lib) {
      return buildClient(lib);
    }).catch(function () {
      return null;
    });
  }

  function friendlyError(err) {
    var m = String((err && (err.message || err.error_description)) || err || "");
    if (/supabase_lib_missing/i.test(m)) {
      return "Unable to load the account service. Check your internet connection and try again.";
    }
    if (/Failed to fetch|NetworkError|fetch/i.test(m)) {
      return "Unable to reach Receipt Pilot cloud right now. Your work is still saved on this device.";
    }
    if (/Invalid login credentials/i.test(m)) return "Those details do not match an account.";
    if (/already registered|User already registered/i.test(m)) {
      return "That email already has an account. Try logging in.";
    }
    if (/Password should be|password/i.test(m) && /6|least/i.test(m)) {
      return "Use a password of at least 6 characters.";
    }
    if (/Email not confirmed/i.test(m)) {
      return "Please verify your email, then log in.";
    }
    if (/rate limit/i.test(m)) return "Too many attempts. Please wait a moment and try again.";
    if (global.ReceiptlyErrors) ReceiptlyErrors.report(m.slice(0, 180), "supabase");
    return "Unable to complete that right now. Please try again.";
  }

  global.ReceiptlyCloud = {
    configured: configured,
    client: getClient,
    ready: ready,
    friendlyError: friendlyError
  };
})(window);n.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.min.js";

  function configured() {
    return !!(global.ReceiptlyConfig && typeof global.ReceiptlyConfig.isSupabaseConfigured === "function" &&
      global.ReceiptlyConfig.isSupabaseConfigured());
  }

  function findLib() {
    var lib = global.supabase;
    if (lib && typeof lib.createClient === "function") return lib;
    try {
      if (typeof supabase !== "undefined" && supabase && typeof supabase.createClient === "function") return supabase;
    } catch (e) { /* not in scope */ }
    return null;
  }

  function ensureLib() {
    var lib = findLib();
    if (lib) return Promise.resolve(lib);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = CDN;
      s.async = false;
      s.onload = function () {
        var found = findLib();
        if (found) resolve(found);
        else reject(new Error("supabase_lib_missing"));
      };
      s.onerror = function () { reject(new Error("supabase_lib_missing")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function buildClient(lib) {
    if (client) return client;
    if (!lib || typeof lib.createClient !== "function") return null;
    client = lib.createClient(
      String(global.ReceiptlyConfig.supabaseUrl).trim(),
      String(global.ReceiptlyConfig.supabaseAnonKey).trim(),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "receiptly-auth"
        }
      }
    );
    return client;
  }

  function getClient() {
    if (!configured()) return null;
    if (client) return client;
    return buildClient(findLib());
  }

  function ready() {
    if (!configured()) return Promise.resolve(null);
    if (client) return Promise.resolve(client);
    return ensureLib().then(function (lib) {
      return buildClient(lib);
    }).catch(function () {
      return null;
    });
  }

  function friendlyError(err) {
    var m = String((err && (err.message || err.error_description)) || err || "");
    if (/supabase_lib_missing/i.test(m)) {
      return "Unable to load the account service. Check your internet connection and try again.";
    }
    if (/Failed to fetch|NetworkError|fetch/i.test(m)) {
      return "Unable to reach Receipt Pilot cloud right now. Your work is still saved on this device.";
    }
    if (/Invalid login credentials/i.test(m)) return "Those details do not match an account.";
    if (/already registered|User already registered/i.test(m)) {
      return "That email already has an account. Try logging in.";
    }
    if (/Password should be|password/i.test(m) && /6|least/i.test(m)) {
      return "Use a password of at least 6 characters.";
    }
    if (/Email not confirmed/i.test(m)) {
      return "Please verify your email, then log in.";
    }
    if (/rate limit/i.test(m)) return "Too many attempts. Please wait a moment and try again.";
    if (global.ReceiptlyErrors) ReceiptlyErrors.report(m.slice(0, 180), "supabase");
    return "Unable to complete that right now. Please try again.";
  }

  global.ReceiptlyCloud = {
    configured: configured,
    client: getClient,
    ready: ready,
    friendlyError: friendlyError
  };
})(window);
