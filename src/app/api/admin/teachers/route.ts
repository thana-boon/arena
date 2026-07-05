import { ok, handle, fail } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { fetchAllTeachers, teacherFullName } from "@/lib/external/teacher-api";
import { syncSubjectGroupCatalog, getSubjectGroupMap, subjectGroupLabel } from "@/lib/subjectGroups";

// GET: ดึงรายชื่อครูทั้งหมดจาก Teacher API (สำหรับค้นหา/มอบสิทธิ์)
export async function GET() {
  return handle(async () => {
    await apiRequireRole("admin");
    try {
      // ซิงค์แคตตาล็อกหมวดไปในตัว (best-effort) เพื่อให้ map เลข → ชื่อหมวดล่าสุด
      const [teachers] = await Promise.all([
        fetchAllTeachers(),
        syncSubjectGroupCatalog().catch(() => undefined),
      ]);
      const groupMap = await getSubjectGroupMap();
      return ok({
        teachers: teachers.map((t) => {
          const no = t.subject_group == null ? null : Number(t.subject_group);
          return {
            teacherCode: t.teacher_code,
            name: teacherFullName(t),
            subjectGroupNo: no,
            subjectGroup: subjectGroupLabel(no, groupMap),
          };
        }),
      });
    } catch {
      return fail("เชื่อมต่อ Teacher API ไม่ได้ กรุณาลองใหม่อีกครั้ง", 502);
    }
  });
}
