import { z } from "zod";
import { db } from "@/db";
import { teacherRoles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  teacherCode: z.string().min(1),
  name: z.string().default(""),
  isAdmin: z.boolean(),
  isRecorder: z.boolean(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const body = schema.parse(await req.json());

    const existing = await db.select().from(teacherRoles).where(eq(teacherRoles.teacherCode, body.teacherCode)).limit(1);

    // ถ้าไม่มีสิทธิ์อะไรเลย และมี row อยู่ → ลบทิ้ง; ถ้าไม่มี row → ไม่ต้องสร้าง
    if (!body.isAdmin && !body.isRecorder) {
      if (existing.length) await db.delete(teacherRoles).where(eq(teacherRoles.teacherCode, body.teacherCode));
    } else if (existing.length) {
      await db.update(teacherRoles)
        .set({ isAdmin: body.isAdmin, isRecorder: body.isRecorder, nameSnapshot: body.name })
        .where(eq(teacherRoles.teacherCode, body.teacherCode));
    } else {
      await db.insert(teacherRoles).values({
        teacherCode: body.teacherCode,
        nameSnapshot: body.name,
        isAdmin: body.isAdmin,
        isRecorder: body.isRecorder,
      });
    }
    await logAudit(s.code, "set_teacher_role", body);
    return ok();
  });
}
