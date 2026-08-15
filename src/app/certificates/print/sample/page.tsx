import { notFound } from "next/navigation";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import {
  getEventTemplates,
  loadTemplatesForPrint,
  parseSampleVariant,
  sampleRenderData,
  verifyBaseUrl,
} from "@/lib/certificates";
import { CertificateCanvas } from "@/components/certificate/CertificateCanvas";
import QRCode from "qrcode";
import { PrintTrigger } from "../PrintTrigger";

export const dynamic = "force-dynamic";

/**
 * ใบทดลองพิมพ์ 1 ใบ — ให้ลองยิงเข้าเครื่องพิมพ์จริงก่อนแจกงานจริง
 *
 * ใช้ "แม่แบบที่บันทึกไว้" ไม่ใช่สิ่งที่กำลังแก้ค้างอยู่บนจอ (หน้าออกแบบจึงบันทึกให้ก่อนแล้วค่อยเปิดหน้านี้)
 * — สิ่งที่ทดลองพิมพ์จะได้ตรงกับใบจริงที่ครูจะ export ทีหลังเป๊ะ
 *
 * ใบนี้ไม่ได้ออกเลขทะเบียนจริง: เลขเป็น 0000 (ตัวเดินเลขเริ่มที่ 1 จึงไม่มีวันซ้ำกับใบจริง)
 * และ QR ชี้ไป token "sample" ซึ่งหน้า /verify จะตอบว่าไม่พบ
 *
 * comp/award/rank/team = ใบที่หน้าออกแบบกำลังแสดงอยู่ (ไม่ส่งมา = ใบที่ระบบเลือกให้)
 * — กด "ทดลองพิมพ์" แล้วต้องได้ใบเดียวกับที่เห็นบนจอ ไม่ใช่ใบอื่นในงานเดียวกัน
 */
export default async function CertificateSamplePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string; comp?: string; award?: string; rank?: string; team?: string }>;
}) {
  await requireAdmin();

  const q = await searchParams;
  const eventId = Number(q.eventId);
  if (!Number.isInteger(eventId) || eventId <= 0) notFound();

  const year = await getActiveYear();
  if (!year) notFound();

  const ev = (await db.select().from(events).where(eq(events.id, eventId)).limit(1))[0];
  if (!ev || ev.yearId !== year.id) notFound();

  const main = (await getEventTemplates(eventId)).find((t) => t.medalFilter === "");
  if (!main) {
    return (
      <div style={{ padding: 40, fontSize: 18 }}>
        ยังไม่ได้บันทึกแม่แบบของงานนี้ — กลับไปกด “บันทึกแม่แบบ” ที่หน้าออกแบบก่อน แล้วลองใหม่
      </div>
    );
  }

  const tpl = (await loadTemplatesForPrint([main.id])).get(main.id);
  if (!tpl) notFound();

  const data = await sampleRenderData(eventId, ev.name, year.yearBe, {
    eventKind: ev.kind,
    variant: parseSampleVariant(q),
  });
  const qrSvg = await QRCode.toString(`${await verifyBaseUrl()}/${data.verifyToken}`, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
  });

  const orientation = tpl.orientation;

  return (
    <div className="cert-print-root">
      <style>{`@media print { @page { size: A4 ${orientation}; margin: 0; } }`}</style>
      <PrintTrigger />
      <div className={`cert-page cert-page-${orientation}`}>
        <CertificateCanvas
          template={tpl}
          data={data}
          pageWidth={orientation === "portrait" ? "210mm" : "297mm"}
          qrSvg={qrSvg}
        />
      </div>
    </div>
  );
}
