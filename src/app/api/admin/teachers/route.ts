import { ok, handle, fail } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { fetchAllTeachers, teacherFullName } from "@/lib/external/teacher-api";
import { getSubjectGroupMap, subjectGroupLabel } from "@/lib/subjectGroups";

// GET: ดึงรายชื่อครูทั้งหมดจาก SchoolOS (สำหรับค้นหา/มอบสิทธิ์)
export async function GET() {
  return handle(async () => {
    await apiRequireRole("admin");
    try {
      // fetchAllTeachers อัปเดตแคตตาล็อกหมวด (ชื่อ→เลข) ให้ในตัวแล้ว
      const teachers = await fetchAllTeachers();
      const groupMap = await getSubjectGroupMap();
      return ok({
        teachers: teachers.map((t) => {
          const no = t.subject_group == null ? null : Number(t.subject_group);
          return {
            teacherCode: t.teacher_code,
            name: teacherFullName(t),
            subjectGroupNo: no,
            subjectGroup: subjectGroupLabel(no, groupMap),
            role: t.role, // "teacher" | "teacher-admin" — teacher-admin = admin จาก SchoolOS
          };
        }),
      });
    } catch {
      return fail("เชื่อมต่อ Teacher API ไม่ได้ กรุณาลองใหม่อีกครั้ง", 502);
    }
  });
}
