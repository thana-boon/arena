import { db } from "@/db";
import { teacherRoles } from "@/db/schema";
import { fetchAllTeachers, teacherFullName } from "@/lib/external/teacher-api";
import { TeacherRolesManager } from "./TeacherRolesManager";

export const dynamic = "force-dynamic";

export default async function TeachersPage() {
  const roles = await db.select().from(teacherRoles);

  // ครูที่เป็น admin จาก SchoolOS (role = "teacher-admin") — โชว์ให้เห็นด้วย
  // แม้ไม่มี row ใน teacher_roles สิทธิ์ก็มาจาก API ตอน login (ดู api/auth/login/route.ts)
  let apiAdmins: { teacherCode: string; name: string }[] = [];
  try {
    const teachers = await fetchAllTeachers();
    apiAdmins = teachers
      .filter((t) => t.role === "teacher-admin")
      .map((t) => ({ teacherCode: t.teacher_code, name: teacherFullName(t) }));
  } catch {
    // SchoolOS ล่ม/คีย์มีปัญหา — แสดงเฉพาะสิทธิ์ท้องถิ่นไปก่อน หน้าไม่ต้องพัง
  }

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
        apiAdmins={apiAdmins}
      />
    </div>
  );
}
