import type { Metadata } from "next";
import { MinimalShell } from "@/components/app/MinimalShell";
import { SharedReceipt } from "@/components/shared/SharedReceipt";

export const metadata: Metadata = { title: "Receipt verification", robots: { index: false } };

export default function Page() {
  return <MinimalShell wide><SharedReceipt /></MinimalShell>;
}
