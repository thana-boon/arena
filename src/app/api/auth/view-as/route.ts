import { z } from "zod";
import { getSession, setViewAs } from "@/lib/auth/session";
import { ok, fail, handle } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const Body = z.object({ mode: z.enum(["teacher", "admin"]) });

/**
 * POST — ผู้ดูแลระบบสลับไปใช้งานแบบครูธรรมดา / กลับมาเป็นผู้ดูแลระบบ
 * เช็คจากบทบาทจริง (realRole) ไม่ใช่บทบาทที่กำลังใช้ — ไม่งั้นตอนอยู่โหมดครูจะกดกลับไม่ได้
 */
export async function POST(req: Request) {
  return handle(async () => {
    const s = await getSession();
    if (!s) return fail("กรุณาเข้าสู่ระบบ", 401);
    if ((s.realRole ?? s.role) !== "admin") return fail("ไม่มีสิทธิ์ดำเนินการนี้", 403);
    const { mode } = Body.parse(await req.json());
    await setViewAs(mode);
    await logAudit(s.code, mode === "teacher" ? "view_as_teacher" : "view_as_admin");
    return ok({ redirect: mode === "teacher" ? "/teacher" : "/admin" });
  });
}
