import { db } from "@/db";
import {
  certificateEvents,
  certificateEventCompetitions,
  certificateSignatures,
  certificateTemplates,
  certificateIssues,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { certEventInput } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

// PATCH: แก้ชื่อ/วันที่งาน
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const id = Number((await params).id);
    const body = certEventInput.parse(await req.json());
    const cur = await db.select().from(certificateEvents).where(eq(certificateEvents.id, id)).limit(1);
    if (!cur.length) return fail("ไม่พบงาน", 404);

    await db
      .update(certificateEvents)
      .set({ name: body.name.trim(), eventDate: body.eventDate ?? null })
      .where(eq(certificateEvents.id, id));
    await logAudit(s.code, "update_cert_event", { id });
    return ok();
  });
}

// DELETE: ลบงาน — กันลบถ้าเคยออกเกียรติบัตรไปแล้ว (ทะเบียนต้องคงอยู่)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const id = Number((await params).id);

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
    await db.delete(certificateEventCompetitions).where(eq(certificateEventCompetitions.eventId, id));
    await db.delete(certificateEvents).where(eq(certificateEvents.id, id));
    await logAudit(s.code, "delete_cert_event", { id });
    return ok();
  });
}
