(function (global) {
  "use strict";

  // Public browser keys only. Never add service_role or sb_secret.
  global.ReceiptlyConfig = {
    analyticsEnabled: true,
    gaMeasurementId: "G-XXXXXXXXXX",
    siteOrigin: "",
    supabaseUrl: "https://xwmfkfcsyqgwtfjumubh.supabase.co",
    supabaseAnonKey: "sb_publishable_PZHC5xhToq7OWLGGnKhWwA_5nQZf-ge",
    billingWorkerUrl: ""
  };

  global.ReceiptlyConfig.isSupabaseConfigured = function () {
    var url = String(this.supabaseUrl || "").trim();
    var key = String(this.supabaseAnonKey || "").trim();
    if (url.indexOf("https://") !== 0) return false;
    if (url.indexOf("supabase.co") === -1) return false;
    if (!key) return false;
    if (/YOUR-PROJECT|YOUR-SUPABASE-ANON-KEY|placeholder/i.test(url) || /YOUR-SUPABASE-ANON-KEY|placeholder/i.test(key)) return false;
    return true;
  };
})(window);
