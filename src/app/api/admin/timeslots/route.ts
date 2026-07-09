import { z } from "zod";
import { db } from "@/db";
import { timeSlots } from "@/db/schema";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { getActiveYear, getTimeSlots } from "@/lib/queries";
import { logAudit } from "@/lib/audit";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const slotInput = z
  .object({
    label: z.string().min(1, "กรุณากรอกชื่อช่วงเวลา").max(191),
    startTime: z.string().regex(HHMM, "เวลาไม่ถูกต้อง"),
    endTime: z.string().regex(HHMM, "เวลาไม่ถูกต้อง"),
  })
  .refine((v) => v.startTime < v.endTime, { message: "เวลาเริ่มต้องก่อนเวลาสิ้นสุด", path: ["endTime"] });

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
    const [res] = await db.insert(timeSlots).values({
      yearId: year.id,
      label: body.label.trim(),
      startTime: `${body.startTime}:00`,
      endTime: `${body.endTime}:00`,
      sortOrder: existing.length,
    });
    await logAudit(s.code, "create_time_slot", { id: res.insertId, label: body.label });
    return ok({ id: res.insertId });
  });
}
