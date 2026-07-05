import { requireRole } from "@/lib/auth/guards";
import { AppShell } from "@/components/AppShell";
import { STUDENT_NAV } from "@/lib/nav";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("student");
  return (
    <AppShell session={session} items={STUDENT_NAV} section="นักเรียน">
      {children}
    </AppShell>
  );
}
