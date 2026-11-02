import type { Metadata } from "next";
import { RequireAuth } from "@/components/app/RequireAuth";
import { Customers } from "@/components/customers/Customers";

export const metadata: Metadata = { title: "Customers", robots: { index: false } };

export default function CustomersPage() {
  return <RequireAuth><Customers /></RequireAuth>;
}
