import { AppShell } from "@/components/app/AppShell";

// Same as admin.html: no account, usage or billing scripts on this page.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell access={false} nav={false}>{children}</AppShell>;
}
