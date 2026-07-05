import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { listStudents, studentFullName } from "@/lib/external/student-api";

// GET: รายชื่อนักเรียน (admin) — ค้นหา/กรองตามระดับชั้น + ห้อง พร้อมแบ่งหน้า
export async function GET(req: Request) {
  return handle(async () => {
    await apiRequireRole("admin");
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "";
    const classLevel = searchParams.get("class_level") ?? "";
    const classRoom = searchParams.get("class_room") ?? "";
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const limit = 50;

    try {
      const { data, meta } = await listStudents({
        q: q || undefined,
        class_level: classLevel || undefined,
        class_room: classRoom || undefined,
        page,
        limit,
      });
      return ok({
        students: data.map((s) => ({
          studentCode: s.student_code,
          name: studentFullName(s),
          classLevel: s.class_level,
          classRoom: s.class_room,
        })),
        total: meta.total,
        page: meta.page,
        limit: meta.limit,
      });
    } catch {
      return fail("ดึงรายชื่อนักเรียนไม่สำเร็จ กรุณาลองใหม่", 502);
    }
  });
}
