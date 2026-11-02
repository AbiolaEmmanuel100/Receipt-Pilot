import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

const sans = Source_Sans_3({ subsets: ["latin"], weight: ["400", "600", "700", "800"], display: "swap", variable: "--font-source-sans" });

export const metadata: Metadata = {
  metadataBase: new URL("https://receipt-pilot.com"),
  title: { default: "Online Receipt Maker & Generator for Small Business | Receipt Pilot", template: "%s | Receipt Pilot" },
  description: "Online receipt maker for small businesses. Create professional digital receipts, save sales records, and download PDF or PNG copies.",
  manifest: "/manifest.json",
  icons: { icon: [{ url: "/assets/favicon.svg", type: "image/svg+xml" }], apple: "/assets/apple-touch-icon.png" },
  openGraph: { type: "website", siteName: "Receipt Pilot", images: [{ url: "/assets/og-image.png" }] },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "Receipt Pilot", statusBarStyle: "default" },
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
      <body>{children}</body>
    </html>
  );
}
