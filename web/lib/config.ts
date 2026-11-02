// Public browser keys only. Never add service_role or sb_secret.
// Same values as js/config.js in the legacy site.
export const config = {
  analyticsEnabled: true,
  gaMeasurementId: "G-XXXXXXXXXX",
  siteOrigin: "https://receipt-pilot.com",
  supabaseUrl: "https://xwmfkfcsyqgwtfjumubh.supabase.co",
  supabaseAnonKey: "sb_publishable_PZHC5xhToq7OWLGGnKhWwA_5nQZf-ge",
  billingWorkerUrl: "https://receipt-pilot-billing.eabiolakayode.workers.dev",
};

export function isSupabaseConfigured(): boolean {
  const url = String(config.supabaseUrl || "").trim();
  const key = String(config.supabaseAnonKey || "").trim();
  if (url.indexOf("https://") !== 0) return false;
  if (url.indexOf("supabase.co") === -1) return false;
  if (!key) return false;
  if (/YOUR-PROJECT|YOUR-SUPABASE-ANON-KEY|placeholder/i.test(url) || /YOUR-SUPABASE-ANON-KEY|placeholder/i.test(key)) return false;
  return true;
}
