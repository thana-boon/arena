import { ok, handle, fail } from "@/lib/api";
import { getSession } from "@/lib/auth/session";
import { ApiAuthError } from "@/lib/auth/guards";
import { listClassRooms } from "@/lib/external/student-api";

// GET: รายชื่อห้อง (distinct) ของระดับชั้นหนึ่ง — ใช้เติม dropdown ห้อง (ครู/admin)
export async function GET(req: Request) {
  return handle(async () => {
    const session = await getSession();
    if (!session) throw new ApiAuthError("กรุณาเข้าสู่ระบบ", 401);
    const { searchParams } = new URL(req.url);
    const classLevel = searchParams.get("class_level") ?? "";
    if (!classLevel) return ok({ rooms: [] as string[] });
    try {
      return ok({ rooms: await listClassRooms(classLevel) });
    } catch {
      return fail("ดึงรายชื่อห้องไม่สำเร็จ", 502);
    }
  });
}
