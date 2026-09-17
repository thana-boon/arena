import { db } from "@/db";
import {
  events,
  certificateIssues,
  certificateSignatures,
  certificateTemplateCompetitions,
  certificateTemplates,
  competitions,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { certTemplateCreateInput, certTemplateInput } from "@/lib/validation";
import { insertTemplate, seedDesign, snapshotTemplate, getCertPreset } from "@/lib/certPresets";
import { logAudit } from "@/lib/audit";

/**
 * แม่แบบ ("แบบเกียรติบัตร") ของงานหนึ่ง — 1 งานมีได้หลายแบบ
 * งานเดียวกันมักมีทั้งรายการอบรม (ใบเข้าร่วม ไม่มีเหรียญ/อันดับ) และรายการที่ตัดสินจริง
 * แต่ละแบบผูกได้ว่า "รายการไหนใช้แบบนี้" · รายการที่ไม่ได้ผูก = ใช้แบบหลักของงาน
 */

/** งานที่แก้ดีไซน์ได้ (ล็อกแล้ว = ออกใบไปแล้ว ต้องปลดล็อกก่อน) */
async function editableEvent(eventId: number) {
  const ev = (await db.select().from(events).where(eq(events.id, eventId)).limit(1))[0];
  if (!ev) return { ev: null, error: "ไม่พบงาน" as const };
  if (ev.status === "locked")
    return { ev, error: "งานนี้ถูกล็อกเพราะออกเกียรติบัตรไปแล้ว กรุณาปลดล็อกก่อนแก้ไข" as const };
  return { ev, error: null };
}

/**
 * ผูกรายการเข้ากับแบบหนึ่ง — รายการหนึ่งอยู่ได้แบบเดียว (unique ที่ competition_id)
 * จึงต้องถอดออกจากแบบเดิมก่อนเสมอ ไม่งั้นการย้ายรายการไปอีกแบบจะชน unique แล้วบันทึกไม่ผ่าน
 * รับเฉพาะรายการที่อยู่ในงานนี้จริง — ไม่งั้นแบบของงานหนึ่งไปคร่อมรายการของอีกงานได้
 */
async function setTemplateCompetitions(eventId: number, templateId: number, ids: number[]) {
  const valid = ids.length
    ? (
        await db
          .select({ id: competitions.id })
          .from(competitions)
          .where(and(eq(competitions.eventId, eventId), inArray(competitions.id, ids)))
      ).map((r) => r.id)
    : [];

  await db
    .delete(certificateTemplateCompetitions)
    .where(eq(certificateTemplateCompetitions.templateId, templateId));
  if (!valid.length) return;
  await db
    .delete(certificateTemplateCompetitions)
    .where(inArray(certificateTemplateCompetitions.competitionId, valid));
  await db
    .insert(certificateTemplateCompetitions)
    .values(valid.map((competitionId) => ({ templateId, competitionId })));
}

// PUT: บันทึกแบบหนึ่ง (พื้นหลัง + layout + ผู้ลงนาม + รายการที่ใช้แบบนี้)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const eventId = Number((await params).id);
    const { ev, error } = await editableEvent(eventId);
    if (!ev) return fail(error ?? "ไม่พบงาน", 404);
    if (error) return fail(error);

    const body = certTemplateInput.parse(await req.json());

    // แบบที่จะเขียนทับ: ตามที่ระบุมา หรือแบบหลักของงาน (ทางเดิมของหน้าออกแบบก่อนมีหลายแบบ)
    const existing = body.templateId
      ? await db
          .select({ id: certificateTemplates.id })
          .from(certificateTemplates)
          .where(
            and(eq(certificateTemplates.id, body.templateId), eq(certificateTemplates.eventId, eventId))
          )
          .limit(1)
      : await db
          .select({ id: certificateTemplates.id })
          .from(certificateTemplates)
          .where(
            and(
              eq(certificateTemplates.eventId, eventId),
              eq(certificateTemplates.medalFilter, body.medalFilter)
            )
          )
          .limit(1);
    if (body.templateId && !existing.length) return fail("ไม่พบแบบเกียรติบัตรนี้ในงาน", 404);

    let templateId: number;
    if (existing.length) {
      templateId = existing[0].id;
      await db
        .update(certificateTemplates)
        .set({
          backgroundAssetId: body.backgroundAssetId ?? null,
          orientation: body.orientation,
          layout: JSON.stringify(body.layout),
          ...(body.name != null ? { name: body.name.trim() } : {}),
        })
        .where(eq(certificateTemplates.id, templateId));
    } else {
      // งานเก่าที่ยังไม่มีแม่แบบเลย — แถวแรกที่สร้างคือแบบหลัก
      const [ins] = await db
        .insert(certificateTemplates)
        .values({
          eventId,
          name: body.name?.trim() ?? "",
          isDefault: true,
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
          color: sig.color,
          fontSize: String(sig.fontSize),
          imageScale: String(sig.imageScale),
        }))
      );
    }

    if (body.competitionIds) await setTemplateCompetitions(eventId, templateId, body.competitionIds);

    await logAudit(s.code, "save_cert_template", {
      eventId,
      templateId,
      medalFilter: body.medalFilter,
      ...(body.competitionIds ? { competitions: body.competitionIds.length } : {}),
    });
    return ok({ templateId });
  });
}

/**
 * POST: สร้าง "แบบ" เพิ่มในงาน
 * ลอกจากแบบที่กำลังใช้อยู่ (copyFromTemplateId) หรือจากคลังแม่แบบเริ่มต้น (presetId)
 * — ครูสร้างใบแข่งขันไว้แล้ว อยากได้ใบอบรมที่หน้าตาเดียวกันแต่ตัดบรรทัดเหรียญ/อันดับออก
 *   จึงควรเริ่มจากของเดิมแล้วแก้นิดเดียว ไม่ใช่วางใหม่ทั้งใบ
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const eventId = Number((await params).id);
    const { ev, error } = await editableEvent(eventId);
    if (!ev) return fail(error ?? "ไม่พบงาน", 404);
    if (error) return fail(error);

    const body = certTemplateCreateInput.parse(await req.json());

    let design = await seedDesign();
    if (body.copyFromTemplateId) {
      const src = await snapshotTemplate(body.copyFromTemplateId);
      if (!src) return fail("ไม่พบแบบต้นทางที่จะลอก", 404);
      design = src;
    } else if (body.presetId) {
      const preset = await getCertPreset(body.presetId);
      if (!preset) return fail("ไม่พบแม่แบบเริ่มต้นที่เลือก", 404);
      design = {
        orientation: preset.orientation,
        backgroundAssetId: preset.backgroundAssetId,
        layout: preset.layout,
        signatures: preset.signatures,
      };
    }

    const has = await db
      .select({ id: certificateTemplates.id })
      .from(certificateTemplates)
      .where(eq(certificateTemplates.eventId, eventId))
      .limit(1);

    const templateId = await insertTemplate({
      eventId,
      name: body.name.trim(),
      isDefault: has.length === 0, // แบบแรกของงานเป็นแบบหลักโดยปริยาย
      ...design,
    });
    if (body.competitionIds) await setTemplateCompetitions(eventId, templateId, body.competitionIds);

    await logAudit(s.code, "create_cert_template", { eventId, templateId, name: body.name });
    return ok({ templateId });
  });
}

/**
 * DELETE: ลบ "แบบ" ออกจากงาน (รายการที่ผูกไว้กลับไปใช้แบบหลัก)
 * ห้ามลบแบบหลัก และห้ามลบแบบที่มีใบออกไปแล้ว — ใบที่แจกไปอ้าง template_id ไว้ ถ้าลบจะพิมพ์ซ้ำไม่ได้
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const eventId = Number((await params).id);
    const { ev, error } = await editableEvent(eventId);
    if (!ev) return fail(error ?? "ไม่พบงาน", 404);
    if (error) return fail(error);

    const templateId = Number(new URL(req.url).searchParams.get("templateId"));
    if (!Number.isFinite(templateId) || templateId <= 0) return fail("ไม่ได้ระบุแบบที่จะลบ");

    const tpl = (
      await db
        .select()
        .from(certificateTemplates)
        .where(and(eq(certificateTemplates.id, templateId), eq(certificateTemplates.eventId, eventId)))
        .limit(1)
    )[0];
    if (!tpl) return fail("ไม่พบแบบเกียรติบัตรนี้ในงาน", 404);
    if (tpl.isDefault) return fail("ลบแบบหลักของงานไม่ได้ — ตั้งแบบอื่นเป็นแบบหลักก่อน");

    const used = (
      await db
        .select({ id: certificateIssues.id })
        .from(certificateIssues)
        .where(eq(certificateIssues.templateId, templateId))
        .limit(1)
    ).length;
    if (used) return fail("แบบนี้มีเกียรติบัตรที่ออกไปแล้ว ลบไม่ได้ (ใบที่แจกไปจะพิมพ์ซ้ำไม่ได้)");

    await db
      .delete(certificateTemplateCompetitions)
      .where(eq(certificateTemplateCompetitions.templateId, templateId));
    await db.delete(certificateSignatures).where(eq(certificateSignatures.templateId, templateId));
    await db.delete(certificateTemplates).where(eq(certificateTemplates.id, templateId));

    await logAudit(s.code, "delete_cert_template", { eventId, templateId, name: tpl.name });
    return ok({ deleted: true });
  });
}

/**
 * PATCH: ย้ายธง "แบบหลัก" มาที่แบบหนึ่ง (มีได้ตัวเดียวต่องาน — บังคับที่โค้ด ไม่มี constraint ใน DB)
 * แบบหลักคือแบบที่รายการซึ่งไม่ได้ผูกไว้กับแบบไหนเลยจะใช้
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const eventId = Number((await params).id);
    const { ev, error } = await editableEvent(eventId);
    if (!ev) return fail(error ?? "ไม่พบงาน", 404);
    if (error) return fail(error);

    const { templateId } = (await req.json()) as { templateId?: number };
    if (!templateId) return fail("ไม่ได้ระบุแบบ");
    const tpl = (
      await db
        .select({ id: certificateTemplates.id })
        .from(certificateTemplates)
        .where(and(eq(certificateTemplates.id, templateId), eq(certificateTemplates.eventId, eventId)))
        .limit(1)
    )[0];
    if (!tpl) return fail("ไม่พบแบบเกียรติบัตรนี้ในงาน", 404);

    await db
      .update(certificateTemplates)
      .set({ isDefault: false })
      .where(eq(certificateTemplates.eventId, eventId));
    await db
      .update(certificateTemplates)
      .set({ isDefault: true })
      .where(eq(certificateTemplates.id, templateId));

    await logAudit(s.code, "set_default_cert_template", { eventId, templateId });
    return ok({ templateId });
  });
}
