import { db } from "@/db";
import { academicYears } from "@/db/schema";
import { eq, ne } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const id = Number((await params).id);
    if (!id) return fail("id ไม่ถูกต้อง");

    // เปิดปีเดียว: ปิดปีอื่นทั้งหมด แล้วเปิดปีนี้
    await db.transaction(async (tx) => {
      await tx.update(academicYears).set({ isActive: false }).where(ne(academicYears.id, id));
      await tx.update(academicYears).set({ isActive: true }).where(eq(academicYears.id, id));
    });
    await logAudit(s.code, "activate_year", { yearId: id });
    return ok();
  });
}
