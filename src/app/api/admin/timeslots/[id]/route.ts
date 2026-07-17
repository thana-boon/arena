import { db } from "@/db";
import { timeSlots, competitions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { slotInput } from "@/lib/validation";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const id = Number((await params).id);
    const body = slotInput.parse(await req.json());

    await db
      .update(timeSlots)
      .set({ label: body.label.trim(), startTime: `${body.startTime}:00`, endTime: `${body.endTime}:00` })
      .where(eq(timeSlots.id, id));

    // ซิงค์เวลา snapshot ในรายการแข่งขันที่อ้างช่วงเวลานี้ (ใช้ตรวจเวลาแข่งชนกัน + แสดงผล)
    await db
      .update(competitions)
      .set({ startTime: `${body.startTime}:00`, endTime: `${body.endTime}:00` })
      .where(eq(competitions.timeSlotId, id));

    await logAudit(s.code, "update_time_slot", { id });
    return ok();
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const id = Number((await params).id);
    const used = await db.select({ id: competitions.id }).from(competitions).where(eq(competitions.timeSlotId, id)).limit(1);
    if (used.length) return fail("ลบไม่ได้ เพราะมีรายการแข่งขันใช้ช่วงเวลานี้อยู่");
    await db.delete(timeSlots).where(eq(timeSlots.id, id));
    await logAudit(s.code, "delete_time_slot", { id });
    return ok();
  });
}
