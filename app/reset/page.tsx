import type { Metadata } from "next";
import { MinimalShell } from "@/components/app/MinimalShell";
import { ResetPassword } from "@/components/reset/ResetPassword";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function Page() {
  return <MinimalShell><ResetPassword /></MinimalShell>;
}
