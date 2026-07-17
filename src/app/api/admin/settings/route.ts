import { z } from "zod";
import { db } from "@/db";
import { settings, events } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { logAudit } from "@/lib/audit";

// อัปเดตแบบบางส่วน — ส่งเฉพาะ field ที่แก้ (ฟอร์มเกณฑ์ vs ตัวเลือกงานเริ่มต้น ยิงคนละที)
const schema = z.object({
  maxEntriesPerStudent: z.number().int().min(1).max(20).optional(),
  medalGoldPct: z.number().int().min(0).max(100).optional(),
  medalSilverPct: z.number().int().min(0).max(100).optional(),
  medalBronzePct: z.number().int().min(0).max(100).optional(),
  defaultEventId: z.number().int().positive().nullable().optional(),
});

export async function PATCH(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const body = schema.parse(await req.json());
    const year = await getActiveYear();
    if (!year) return fail("ยังไม่มีปีการศึกษาที่เปิดใช้งาน");

    const set: Record<string, unknown> = {};
    if (body.maxEntriesPerStudent !== undefined) set.maxEntriesPerStudent = body.maxEntriesPerStudent;
    if (body.medalGoldPct !== undefined) set.medalGoldPct = body.medalGoldPct;
    if (body.medalSilverPct !== undefined) set.medalSilverPct = body.medalSilverPct;
    if (body.medalBronzePct !== undefined) set.medalBronzePct = body.medalBronzePct;

    // ตรวจเกณฑ์เหรียญเรียงจากมากไปน้อย (เมื่อส่งครบทั้งสาม)
    if (
      body.medalGoldPct !== undefined &&
      body.medalSilverPct !== undefined &&
      body.medalBronzePct !== undefined &&
      !(body.medalGoldPct >= body.medalSilverPct && body.medalSilverPct >= body.medalBronzePct)
    )
      return fail("เกณฑ์เหรียญต้องเรียงจากมากไปน้อย (ทอง ≥ เงิน ≥ ทองแดง)");

    if (body.defaultEventId !== undefined) {
      if (body.defaultEventId !== null) {
        const ev = await db
          .select({ id: events.id })
          .from(events)
          .where(and(eq(events.id, body.defaultEventId), eq(events.yearId, year.id)))
          .limit(1);
        if (!ev.length) return fail("งานเริ่มต้นไม่ถูกต้อง");
      }
      set.defaultEventId = body.defaultEventId;
    }

    if (Object.keys(set).length) {
      await db.update(settings).set(set).where(eq(settings.yearId, year.id));
    }
    await logAudit(s.code, "update_settings", { yearId: year.id });
    return ok();
  });
}
