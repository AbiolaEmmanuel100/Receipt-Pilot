import type { Metadata } from "next";
import { RequireAuth } from "@/components/app/RequireAuth";
import { Records } from "@/components/records/Records";

export const metadata: Metadata = { title: "Receipt history", robots: { index: false } };

export default function RecordsPage() {
  return <RequireAuth><Records /></RequireAuth>;
}
