import type { Metadata } from "next";
import { BillingPage } from "@/components/billing/BillingPage";

export const metadata: Metadata = { title: "Subscription", robots: { index: false } };

export default function Page() {
  return <BillingPage />;
}
