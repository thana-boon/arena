import { db } from "@/db";
import { announcements } from "@/db/schema";
import { ok, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { announcementInput } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

// POST: สร้างประกาศใหม่ — ตั้งใจให้ยังไม่แสดง (is_active = false) จนกว่าจะกด "เปิด"
// เพราะพิมพ์ผิดแล้วขึ้นทั้งโรงเรียนทันทีเป็นเรื่องที่ถอนคืนไม่ได้
export async function POST(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const body = announcementInput.parse(await req.json());

    const [row] = await db
      .insert(announcements)
      .values({
        title: body.title.trim(),
        body: body.body.trim(),
        level: body.level,
        audience: body.audience,
        isActive: body.isActive ?? false,
        dismissible: body.dismissible ?? true,
        createdBy: s.code,
      })
      .returning({ id: announcements.id });

    await logAudit(s.code, "create_announcement", { id: row.id, audience: body.audience });
    return ok({ id: row.id });
  });
}
