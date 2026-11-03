import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { INSTALL_SNIPPET } from "@/lib/installSnippet";

const sans = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL("https://receipt-pilot.com"),
  title: { default: "Online Receipt Maker & Generator for Small Business | Receipt Pilot", template: "%s | Receipt Pilot" },
  description: "Online receipt maker for small businesses. Create professional digital receipts, save sales records, and download PDF or PNG copies.",
  manifest: "/manifest.json",
  icons: { icon: [{ url: "/assets/favicon.svg", type: "image/svg+xml" }], apple: "/assets/apple-touch-icon.png" },
  openGraph: { type: "website", siteName: "Receipt Pilot", images: [{ url: "/assets/og-image.png" }] },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "Receipt Pilot", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <head>
        {/* Keep the browser's install prompt for the "Install app" button (it can fire before the app loads). */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_SNIPPET }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
