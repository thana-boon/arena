import { db } from "@/db";
import { events, certificateSignatures, certificateTemplates } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { certTemplateInput } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

// PUT: บันทึกแม่แบบ (พื้นหลัง + layout + ผู้ลงนาม) ของงาน
// งานที่ล็อกแล้ว (ออกใบไปแล้ว) แก้ไม่ได้จนกว่าจะปลดล็อก — กันใบพิมพ์ซ้ำหน้าตาไม่ตรงกับที่แจกไปแล้ว
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const eventId = Number((await params).id);
    const ev = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!ev.length) return fail("ไม่พบงาน", 404);
    if (ev[0].status === "locked")
      return fail("งานนี้ถูกล็อกเพราะออกเกียรติบัตรไปแล้ว กรุณาปลดล็อกก่อนแก้ไข");

    const body = certTemplateInput.parse(await req.json());

    // upsert แม่แบบตาม (event, medalFilter)
    const existing = await db
      .select({ id: certificateTemplates.id })
      .from(certificateTemplates)
      .where(
        and(
          eq(certificateTemplates.eventId, eventId),
          eq(certificateTemplates.medalFilter, body.medalFilter)
        )
      )
      .limit(1);

    let templateId: number;
    if (existing.length) {
      templateId = existing[0].id;
      await db
        .update(certificateTemplates)
        .set({
          backgroundAssetId: body.backgroundAssetId ?? null,
          orientation: body.orientation,
          layout: JSON.stringify(body.layout),
        })
        .where(eq(certificateTemplates.id, templateId));
    } else {
      const [ins] = await db
        .insert(certificateTemplates)
        .values({
          eventId,
          medalFilter: body.medalFilter,
          backgroundAssetId: body.backgroundAssetId ?? null,
          orientation: body.orientation,
          layout: JSON.stringify(body.layout),
        })
        .returning({ id: certificateTemplates.id });
      templateId = ins.id;
    }

    // แทนที่ผู้ลงนามทั้งชุด
    await db.delete(certificateSignatures).where(eq(certificateSignatures.templateId, templateId));
    if (body.signatures.length) {
      await db.insert(certificateSignatures).values(
        body.signatures.map((sig, i) => ({
          templateId,
          sortOrder: i,
          name: sig.name?.trim() ?? "",
          roleLabel: sig.roleLabel?.trim() ?? "",
          mode: sig.mode,
          assetId: sig.mode === "image" ? sig.assetId ?? null : null,
          x: String(sig.x),
          y: String(sig.y),
          width: String(sig.width),
        }))
      );
    }

    await logAudit(s.code, "save_cert_template", { eventId, templateId, medalFilter: body.medalFilter });
    return ok({ templateId });
  });
}
