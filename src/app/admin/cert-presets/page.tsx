import { db } from "@/db";
import { certificateTemplates, events } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { getActiveYear } from "@/lib/queries";
import { listCertPresets, listSignaturePresets } from "@/lib/certPresets";
import { formatThaiDate } from "@/lib/domain";
import { CertPresetsManager } from "./CertPresetsManager";

export const dynamic = "force-dynamic";

/**
 * คลัง "แม่แบบเริ่มต้น" ของเกียรติบัตร + ลายเซ็นที่ใช้บ่อย
 *
 * มีเพราะทุกงานเริ่มจากใบเปล่าแล้ววางทุกอย่างใหม่ทุกครั้ง ทั้งที่ 90% ของใบเหมือนเดิม
 * เก็บแบบที่จัดไว้แล้วหนึ่งอันเป็น "ค่าเริ่มต้น" → งานที่สร้างใหม่ได้ดีไซน์นั้นมาให้ทันที
 */
export default async function CertPresetsPage() {
  const year = await getActiveYear();
  const presets = await listCertPresets();
  const sigPresets = await listSignaturePresets();

  // แบบของงานในปีนี้ — ไว้ให้เลือก "เก็บจากงานที่เคยทำ" โดยไม่ต้องเข้าไปที่หน้าออกแบบ
  const rows = year
    ? await db
        .select({
          templateId: certificateTemplates.id,
          templateName: certificateTemplates.name,
          isDefault: certificateTemplates.isDefault,
          eventId: events.id,
          eventName: events.name,
          eventDate: events.eventDate,
        })
        .from(certificateTemplates)
        .innerJoin(events, eq(events.id, certificateTemplates.eventId))
        .where(eq(events.yearId, year.id))
        .orderBy(desc(events.createdAt), asc(certificateTemplates.id))
    : [];

  const sources = rows.map((r) => ({
    templateId: r.templateId,
    label:
      `${r.eventName}${r.eventDate ? ` (${formatThaiDate(r.eventDate)})` : ""}` +
      ` — ${r.templateName || (r.isDefault ? "แบบหลัก" : "ไม่มีชื่อ")}`,
  }));

  return (
    <div className="stack">
      <div className="page-header">
        <h1>แม่แบบเริ่มต้น</h1>
        <div className="subtitle">
          เก็บดีไซน์เกียรติบัตรที่ใช้ประจำไว้หนึ่งชุด งานที่สร้างใหม่จะเริ่มจากแบบนี้ ไม่ต้องวางใหม่ทุกครั้ง ·
          ลายเซ็นของผู้บริหารเก็บไว้ที่นี่เช่นกัน หยิบใช้ได้ทุกงาน
        </div>
      </div>
      <CertPresetsManager
        presets={presets.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          isDefault: p.isDefault,
          orientation: p.orientation,
          backgroundAssetId: p.backgroundAssetId,
          layout: p.layout,
          signatures: p.signatures,
        }))}
        sigPresets={sigPresets}
        sources={sources}
        yearBe={year?.yearBe ?? new Date().getFullYear() + 543}
        dateText={formatThaiDate(new Date())}
      />
    </div>
  );
}
