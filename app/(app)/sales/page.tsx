import type { Metadata } from "next";
import { RequireAuth } from "@/components/app/RequireAuth";
import { Sales } from "@/components/sales/Sales";

export const metadata: Metadata = { title: "Sales records", description: "Daily, weekly and monthly sales totals calculated from your saved receipts.", robots: { index: false } };

export default function SalesPage() {
  return <RequireAuth><Sales /></RequireAuth>;
}
