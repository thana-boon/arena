import { db } from "@/db";
import { teacherRoles } from "@/db/schema";
import { TeacherRolesManager } from "./TeacherRolesManager";

export const dynamic = "force-dynamic";

export default async function TeachersPage() {
  const roles = await db.select().from(teacherRoles);
  return (
    <div className="stack">
      <div className="page-header">
        <h1>สิทธิ์ครู</h1>
        <div className="subtitle">มอบสิทธิ์ผู้ดูแลระบบ (admin) หรือผู้บันทึกผล (recorder) ให้ครู</div>
      </div>
      <TeacherRolesManager
        roles={roles.map((r) => ({
          teacherCode: r.teacherCode,
          name: r.nameSnapshot,
          isAdmin: r.isAdmin,
          isRecorder: r.isRecorder,
        }))}
      />
    </div>
  );
}
