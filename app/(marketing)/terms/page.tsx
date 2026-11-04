import type { Metadata } from "next";
import { Prose } from "@/components/marketing/Prose";

export const metadata: Metadata = {
  title: { absolute: "Terms of Use | Receipt Pilot Online Receipt Generator" },
  description: "Terms for using Receipt Pilot to create digital receipts, save sales records, and download PDF or PNG copies.",
  alternates: { canonical: "/terms" },
};

// Legal copy ported verbatim from terms.html (do not edit without Abiola's sign-off).
export default function Terms() {
  return (
    <Prose>
      <h1>Terms of Use</h1>
      <p>Last updated: 16 September 2026</p>
      <p>Receipt Pilot provides a free browser-based receipt generator and local record list. You may use it to create receipts for your own business activity. You are responsible for backing up records stored on your device. This tool is not accounting, tax or legal advice.</p>
      <h2>No professional advice</h2>
      <p>Receipts created with this tool are templates. You are responsible for tax, legal and record-keeping requirements in your location.</p>
      <h2>Accuracy</h2>
      <p>You are responsible for the information you enter. The site calculates totals from those values. Always check the preview before you send a receipt to a customer.</p>
      <h2>Availability</h2>
      <p>The service is provided as-is, without warranties. Features may change. Third-party libraries and advertising networks are outside our control.</p>
      <h2>Acceptable use</h2>
      <p>Do not use the generator to create fraudulent documents or to misrepresent a transaction.</p>
    </Prose>
  );
}
