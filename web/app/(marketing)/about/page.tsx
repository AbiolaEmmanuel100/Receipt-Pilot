import type { Metadata } from "next";
import Link from "next/link";
import { Prose } from "@/components/marketing/Prose";
import { buttonClass } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: { absolute: "About Receipt Pilot | Digital Receipt Maker for Businesses" },
  description: "Learn how Receipt Pilot helps small businesses create professional receipts online, save receipt records, and download printable PDF or PNG receipts.",
  alternates: { canonical: "/about" },
};

export default function About() {
  return (
    <Prose>
      <h1>About Receipt Pilot</h1>
      <p>Receipt Pilot is an online receipt maker and receipt generator for small businesses. It helps you create professional digital receipts in the browser, keep sales records, and download printable PDF or PNG copies.</p>
      <h2>What you can do</h2>
      <p>Create receipts online with your business details, customer information and line items. Saved receipts stay on this device. With an account, they can also sync across the devices you use.</p>
      <h2>Who it is for</h2>
      <p>Receipt Pilot is for shops, service providers and other small businesses that need paperless receipts without a complex accounting suite.</p>
      <p>You can use it without an account. Create an account if you want receipts backed up and available on other devices.</p>
      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link prefetch={false} href="/new" className={buttonClass("primary", "md", "!text-white")}>Open the online receipt generator</Link>
        <Link prefetch={false} href="/privacy-policy">Privacy Policy</Link><span aria-hidden="true">·</span><Link prefetch={false} href="/terms">Terms</Link>
      </div>
    </Prose>
  );
}
