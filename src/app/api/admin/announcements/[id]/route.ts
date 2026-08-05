import { db } from "@/db";
import { announcements } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { announcementInput } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

// อัปเดตแบบบางส่วน — ปุ่มสวิตช์ "เปิด/ปิด" ยิงมาแค่ isActive ตัวเดียว ไม่ต้องส่งข้อความทั้งก้อน
const patchSchema = announcementInput.partial();

/** id ที่ไม่ใช่จำนวนเต็ม → NaN แล้วหลุดเข้า query เป็น error 500 ; ตอบ 404 ตรง ๆ ดีกว่า */
const parseId = (raw: string) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const id = parseId((await params).id);
    if (id === null) return fail("ไม่พบประกาศนี้", 404);
    const body = patchSchema.parse(await req.json());

    const cur = await db
      .select({ id: announcements.id })
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);
    if (!cur.length) return fail("ไม่พบประกาศนี้", 404);

    const set: Record<string, unknown> = {};
    if (body.title !== undefined) set.title = body.title.trim();
    if (body.body !== undefined) {
      const text = body.body.trim();
      if (!text) return fail("กรุณากรอกข้อความประกาศ");
      set.body = text;
    }
    if (body.level !== undefined) set.level = body.level;
    if (body.audience !== undefined) set.audience = body.audience;
    if (body.isActive !== undefined) set.isActive = body.isActive;
    if (body.dismissible !== undefined) set.dismissible = body.dismissible;

    if (Object.keys(set).length) {
      await db.update(announcements).set(set).where(eq(announcements.id, id));
    }
    // แยก action ให้เห็นชัดใน audit ว่าเป็นการ "เปิด/ปิดการแสดง" หรือ "แก้ข้อความ"
    const onlyToggle = Object.keys(set).length === 1 && set.isActive !== undefined;
    await logAudit(s.code, onlyToggle ? "toggle_announcement" : "update_announcement", {
      id,
      ...(set.isActive !== undefined ? { isActive: set.isActive } : {}),
    });
    return ok();
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const id = parseId((await params).id);
    if (id === null) return fail("ไม่พบประกาศนี้", 404);
    const deleted = await db
      .delete(announcements)
      .where(eq(announcements.id, id))
      .returning({ id: announcements.id });
    if (!deleted.length) return fail("ไม่พบประกาศนี้", 404);
    await logAudit(s.code, "delete_announcement", { id });
    return ok();
  });
}
