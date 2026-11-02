import type { Metadata } from "next";
import { Records } from "@/components/records/Records";

export const metadata: Metadata = { title: "Receipts", robots: { index: false } };

export default function RecordsPage() {
  return <Records />;
}
