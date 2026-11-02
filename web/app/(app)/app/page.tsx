import type { Metadata } from "next";
import { RequireAuth } from "@/components/app/RequireAuth";
import { Dashboard } from "@/components/dashboard/Dashboard";

export const metadata: Metadata = { title: "Home", robots: { index: false } };

export default function DashboardPage() {
  return <RequireAuth><Dashboard /></RequireAuth>;
}
