import { AppShell } from "@/components/app/AppShell";

// The old billing.html loaded neither account.js nor usage.js, so the shell
// here skips the account boot, trial banner and paywall (access={false}).
export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return <AppShell access={false}>{children}</AppShell>;
}
