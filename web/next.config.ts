import type { NextConfig } from "next";

// Static export: every page is plain HTML/JS/CSS in out/, served by
// Cloudflare as static assets exactly like the current site. All data is
// fetched client-side from Supabase and the billing Worker.
const nextConfig: NextConfig = {
  output: "export",
  // /billing -> out/billing.html, so the Paystack callback /billing.html
  // (SITE_ORIGIN + "/billing.html") keeps resolving to a real file.
  trailingSlash: false,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
