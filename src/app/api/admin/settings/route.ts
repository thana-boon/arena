import { z } from "zod";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  maxEntriesPerStudent: z.number().int().min(1).max(20),
  registrationOpen: z.boolean(),
  regStart: z.string().nullable().optional(),
  regEnd: z.string().nullable().optional(),
  medalGoldPct: z.number().int().min(0).max(100),
  medalSilverPct: z.number().int().min(0).max(100),
  medalBronzePct: z.number().int().min(0).max(100),
});

export async function PATCH(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const body = schema.parse(await req.json());
    if (!(body.medalGoldPct >= body.medalSilverPct && body.medalSilverPct >= body.medalBronzePct))
      return fail("เกณฑ์เหรียญต้องเรียงจากมากไปน้อย (ทอง ≥ เงิน ≥ ทองแดง)");

    const year = await getActiveYear();
    if (!year) return fail("ยังไม่มีปีการศึกษาที่เปิดใช้งาน");

    await db
      .update(settings)
      .set({
        maxEntriesPerStudent: body.maxEntriesPerStudent,
        registrationOpen: body.registrationOpen,
        regStart: body.regStart ? new Date(body.regStart) : null,
        regEnd: body.regEnd ? new Date(body.regEnd) : null,
        medalGoldPct: body.medalGoldPct,
        medalSilverPct: body.medalSilverPct,
        medalBronzePct: body.medalBronzePct,
      })
      .where(eq(settings.yearId, year.id));
    await logAudit(s.code, "update_settings", { yearId: year.id });
    return ok();
  });
}
