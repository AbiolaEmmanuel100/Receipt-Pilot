import type { Metadata } from "next";
import { Prose } from "@/components/marketing/Prose";

export const metadata: Metadata = {
  title: { absolute: "Privacy Policy | How Receipt Pilot Stores Receipt Data" },
  description: "Read how Receipt Pilot handles receipt records, local storage, accounts, cookies and advertising.",
  alternates: { canonical: "/privacy-policy" },
};

// Legal copy ported verbatim from privacy-policy.html (do not edit without Abiola's sign-off).
// 2026-11-02: CDN sentence under "Third-party scripts" updated with Abiola's approval (libraries are now bundled).
export default function Privacy() {
  return (
    <Prose>
      <h1>Privacy Policy</h1>
      <p>Last updated: 16 September 2026</p>
      <h2>Receipt data</h2>
      <p>Receipt records are stored in this browser on this device. If you create a Receipt Pilot account, your receipts, business details and template preference can also be stored in your cloud account so you can use them on other devices. Other customers cannot read your records. Clearing browser or site data may still remove the local copy. Changing devices does not transfer records unless you are logged in. Use Backup Your Records if you want a file you can keep yourself.</p>
      <h2>Analytics</h2>
      <p>If Google Analytics is connected on a live site, it may record page views and anonymous action events such as saving or downloading a receipt. Receipt contents, names, phone numbers, amounts and notes are not sent as analytics event data by this application.</p>
      <h2>Installed app and offline cache</h2>
      <p>If you install Receipt Pilot on a device, a service worker may cache pages and scripts so the generator and saved records can work without a network connection. That cache stays on your device. Uninstalling the app or clearing site data removes it.</p>
      <h2>Third-party scripts</h2>
      <p>PDF download uses client-side libraries (html2canvas and jsPDF) that are bundled with the site and served from receipt-pilot.com, not from a public CDN. Those providers may receive standard technical requests such as your IP address when the files are loaded.</p>
      <h2>Advertising and cookies</h2>
      <p>This website is prepared for display advertising (for example Google AdSense). When ads are enabled, advertising partners may use cookies or similar technologies to serve and measure ads. We do not place ads inside the generated receipt, the printed receipt or the downloaded PDF.</p>
      <h2>Contact</h2>
      <p>Questions about this policy can be sent through the account tools in Receipt Pilot.</p>
    </Prose>
  );
}
