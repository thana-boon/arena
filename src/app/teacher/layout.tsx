import { requireStaff } from "@/lib/auth/guards";
import { AppShell } from "@/components/AppShell";
import { TEACHER_NAV } from "@/lib/nav";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff();
  return (
    <AppShell session={session} items={TEACHER_NAV} section="พื้นที่ครู">
      {children}
    </AppShell>
  );
}
