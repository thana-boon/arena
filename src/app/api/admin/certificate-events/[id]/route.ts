import { db } from "@/db";
import {
  events,
  competitions,
  certificateSignatures,
  certificateTemplates,
  certificateIssues,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { certEventInput } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

// PATCH: แก้ข้อมูลงาน (ชื่อ/ประเภท/วันที่ + การรับสมัคร)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const id = Number((await params).id);
    const body = certEventInput.parse(await req.json());
    const cur = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!cur.length) return fail("ไม่พบงาน", 404);

    await db
      .update(events)
      .set({
        name: body.name.trim(),
        ...(body.kind ? { kind: body.kind } : {}),
        eventDate: body.eventDate ?? null,
        ...(body.visibleToStudents !== undefined ? { visibleToStudents: body.visibleToStudents } : {}),
        ...(body.registrationOpen !== undefined ? { registrationOpen: body.registrationOpen } : {}),
        regStart: body.regStart ? new Date(body.regStart) : null,
        regEnd: body.regEnd ? new Date(body.regEnd) : null,
      })
      .where(eq(events.id, id));
    await logAudit(s.code, "update_event", { id });
    return ok();
  });
}

// DELETE: ลบงาน — กันลบถ้ายังมีรายการในงาน หรือเคยออกเกียรติบัตรไปแล้ว
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const id = Number((await params).id);

    const hasComp = await db
      .select({ id: competitions.id })
      .from(competitions)
      .where(eq(competitions.eventId, id))
      .limit(1);
    if (hasComp.length) return fail("ลบไม่ได้ เพราะยังมีรายการอยู่ในงานนี้ กรุณาย้าย/ลบรายการก่อน");

    const issued = await db
      .select({ id: certificateIssues.id })
      .from(certificateIssues)
      .where(eq(certificateIssues.eventId, id))
      .limit(1);
    if (issued.length) return fail("ลบไม่ได้ เพราะออกเกียรติบัตรของงานนี้ไปแล้ว");

    const tpls = await db
      .select({ id: certificateTemplates.id })
      .from(certificateTemplates)
      .where(eq(certificateTemplates.eventId, id));
    if (tpls.length) {
      await db.delete(certificateSignatures).where(
        inArray(certificateSignatures.templateId, tpls.map((t) => t.id))
      );
    }
    await db.delete(certificateTemplates).where(eq(certificateTemplates.eventId, id));
    await db.delete(events).where(eq(events.id, id));
    await logAudit(s.code, "delete_event", { id });
    return ok();
  });
}
