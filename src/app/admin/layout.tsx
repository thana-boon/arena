import { requireAdmin } from "@/lib/auth/guards";
import { AppShell } from "@/components/AppShell";
import { ADMIN_NAV_GROUPS } from "@/lib/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return (
    <AppShell session={session} groups={ADMIN_NAV_GROUPS}>
      {children}
    </AppShell>
  );
}
