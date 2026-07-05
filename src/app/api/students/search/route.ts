import { ok, handle, fail } from "@/lib/api";
import { getSession } from "@/lib/auth/session";
import { ApiAuthError } from "@/lib/auth/guards";
import { searchStudents, studentFullName } from "@/lib/external/student-api";

export async function GET(req: Request) {
  return handle(async () => {
    const session = await getSession();
    if (!session) throw new ApiAuthError("กรุณาเข้าสู่ระบบ", 401);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "";
    const classLevel = searchParams.get("class_level") ?? "";
    const classRoom = searchParams.get("class_room") ?? "";
    if (!q && !classLevel && !classRoom) return ok({ students: [] });

    try {
      const students = await searchStudents({
        q: q || undefined,
        class_level: classLevel || undefined,
        class_room: classRoom || undefined,
      });
      return ok({
        students: students.slice(0, 50).map((s) => ({
          studentCode: s.student_code,
          name: studentFullName(s),
          classLevel: s.class_level,
          classRoom: s.class_room,
        })),
      });
    } catch {
      return fail("ค้นหานักเรียนไม่สำเร็จ กรุณาลองใหม่", 502);
    }
  });
}
