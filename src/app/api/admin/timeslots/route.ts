import { db } from "@/db";
import { timeSlots } from "@/db/schema";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { getActiveYear, getTimeSlots } from "@/lib/queries";
import { slotInput } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

// GET: รายการช่วงเวลาของปีที่ active
export async function GET() {
  return handle(async () => {
    await apiRequireRole("admin");
    const year = await getActiveYear();
    if (!year) return fail("ยังไม่มีปีการศึกษาที่เปิดใช้งาน");
    return ok({ slots: await getTimeSlots(year.id) });
  });
}

// POST: สร้างช่วงเวลาใหม่
export async function POST(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const body = slotInput.parse(await req.json());
    const year = await getActiveYear();
    if (!year) return fail("ยังไม่มีปีการศึกษาที่เปิดใช้งาน");

    const existing = await getTimeSlots(year.id);
    const [res] = await db
      .insert(timeSlots)
      .values({
        yearId: year.id,
        label: body.label.trim(),
        startTime: `${body.startTime}:00`,
        endTime: `${body.endTime}:00`,
        sortOrder: existing.length,
      })
      .returning({ id: timeSlots.id });
    await logAudit(s.code, "create_time_slot", { id: res.id, label: body.label });
    return ok({ id: res.id });
  });
}
