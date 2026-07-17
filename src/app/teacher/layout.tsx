import { requireStaff } from "@/lib/auth/guards";
import { AppShell } from "@/components/AppShell";
import { TEACHER_NAV_GROUPS } from "@/lib/nav";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff();
  return (
    <AppShell session={session} groups={TEACHER_NAV_GROUPS}>
      {children}
    </AppShell>
  );
}
