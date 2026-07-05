import { requireAdmin } from "@/lib/auth/guards";
import { AppShell } from "@/components/AppShell";
import { ADMIN_NAV } from "@/lib/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return (
    <AppShell session={session} items={ADMIN_NAV} section="ผู้ดูแลระบบ">
      {children}
    </AppShell>
  );
}
