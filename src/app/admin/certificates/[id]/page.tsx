import { notFound } from "next/navigation";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getActiveYear } from "@/lib/queries";
import {
  buildSampleData,
  defaultLayout,
  defaultSampleVariant,
  getEventTemplates,
  mainTemplate,
  sampleCompetitions,
  verifyBaseUrl,
} from "@/lib/certificates";
import { listCertPresets, listSignaturePresets } from "@/lib/certPresets";
import { formatThaiDate } from "@/lib/domain";
import QRCode from "qrcode";
import { CertEditor } from "./CertEditor";

export const dynamic = "force-dynamic";

export default async function CertEventEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tpl?: string }>;
}) {
  const eventId = Number((await params).id);
  const year = await getActiveYear();
  if (!year) notFound();

  const ev = (
    await db.select().from(events).where(eq(events.id, eventId)).limit(1)
  )[0];
  if (!ev || ev.yearId !== year.id) notFound();

  const templates = await getEventTemplates(eventId);
  // งานหนึ่งมีได้หลาย "แบบ" — ?tpl= บอกว่ากำลังแก้แบบไหน (ไม่ระบุ/ระบุผิด = แบบหลัก)
  const wanted = Number((await searchParams).tpl);
  const current = templates.find((t) => t.id === wanted) ?? mainTemplate(templates);

  // รายการในงานนี้ + คนตัวอย่างของแต่ละรายการ (source of truth = competitions.event_id)
  // ส่งไปทั้งชุด เพื่อให้หน้าออกแบบสลับดูใบของรายการ/รางวัลอื่นได้เองโดยไม่ต้องโหลดหน้าใหม่
  const compsInEvent = await sampleCompetitions(eventId);

  // ตัวอย่างชุดเดียวกับที่ใบทดลองพิมพ์ใช้ — ที่เห็นบนจอกับที่ออกจากเครื่องพิมพ์จะได้ตรงกัน
  // ถ้าแบบนี้ผูกกับรายการไว้ ให้เปิดมาที่ใบของรายการแรกที่ผูก — กำลังออกแบบใบของรายการพวกนั้นอยู่
  const bound = compsInEvent.filter((c) => current?.competitionIds.includes(c.id));
  const initialVariant = defaultSampleVariant(bound.length ? bound : compsInEvent, ev.kind);
  const sample = buildSampleData({
    comps: compsInEvent,
    eventName: ev.name,
    yearBe: year.yearBe,
    dateText: formatThaiDate(new Date()),
    variant: initialVariant,
  });

  // QR ของจริง (ชี้ token "sample" ซึ่งหน้า /verify จะตอบว่าไม่พบ) — สร้างที่ฝั่งเซิร์ฟเวอร์เหมือนตอนพิมพ์
  // เพื่อให้ตัวอย่างในหน้าออกแบบเห็นลายจุดจริง ไม่ใช่กล่องเปล่า และไม่ต้องแบก qrcode ไปไว้ใน bundle ฝั่งเบราว์เซอร์
  const sampleQrSvg = await QRCode.toString(`${await verifyBaseUrl()}/${sample.verifyToken}`, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
  });

  return (
    <CertEditor
      event={{ id: ev.id, name: ev.name, eventDate: ev.eventDate, status: ev.status, kind: ev.kind }}
      yearBe={year.yearBe}
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        isDefault: t.isDefault,
        competitionIds: t.competitionIds,
      }))}
      templateId={current?.id ?? null}
      initialName={current?.name ?? ""}
      initialIsDefault={current?.isDefault ?? true}
      initialCompetitionIds={current?.competitionIds ?? []}
      initialLayout={current?.layout ?? defaultLayout()}
      initialOrientation={current?.orientation ?? "landscape"}
      initialBackgroundId={current?.backgroundAssetId ?? null}
      initialSignatures={
        current?.signatures.map((s) => ({
          name: s.name,
          roleLabel: s.roleLabel,
          mode: s.mode,
          assetId: s.assetId,
          x: s.x,
          y: s.y,
          width: s.width,
          color: s.color,
          fontSize: s.fontSize,
          imageScale: s.imageScale,
        })) ?? []
      }
      sigPresets={await listSignaturePresets()}
      certPresets={(await listCertPresets()).map((p) => ({
        id: p.id,
        name: p.name,
        isDefault: p.isDefault,
      }))}
      competitions={compsInEvent}
      initialVariant={initialVariant}
      sample={sample}
      sampleQrSvg={sampleQrSvg}
    />
  );
}
