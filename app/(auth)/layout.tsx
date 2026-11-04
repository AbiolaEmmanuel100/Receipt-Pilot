import { AppShell } from "@/components/app/AppShell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AppShell nav={false}>{children}</AppShell>;
}
