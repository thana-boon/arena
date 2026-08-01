import { requireAdmin } from "@/lib/auth/guards";
import { getReportBundles } from "@/lib/reportBundle";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq } from "drizzle-orm";
import { CatalogSheet, DOC_LABEL, SUMMARY_DOCS, type DocType, SummarySheet, VenueUsageSheet, ReportSheet } from "@/app/admin/reports/ReportSheets";
import { PrintControls } from "./PrintControls";

export const dynamic = "force-dynamic";

/** หน้าเอกสารสำหรับพิมพ์ (เปิดในแท็บใหม่จากหน้าออกรายงาน) — โชว์ตัวอย่างบนจอแล้วเด้งหน้าต่างพิมพ์อัตโนมัติ */
export default async function ReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; doc?: string; groups?: string; levels?: string; split?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const eventId = Number(sp.event) || 0;
  const docType: DocType = (Object.keys(DOC_LABEL) as DocType[]).includes(sp.doc as DocType)
    ? (sp.doc as DocType)
    : "roster";

  // ตัวกรองจากหน้าออกรายงาน (ไม่ส่งมา = เอาทุกหมวด/ทุกชั้น) — ต้องกรองแบบเดียวกับที่หน้านั้นแสดง
  // -1 = "ไม่ระบุหมวด" จึงรับค่าติดลบด้วย ไม่ใช่แค่ id บวก
  const groupIds = new Set(
    (sp.groups ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map(Number)
      .filter(Number.isInteger)
  );
  const levels = new Set((sp.levels ?? "").split(",").map((v) => v.trim()).filter(Boolean));

  const [event] = eventId ? await db.select().from(events).where(eq(events.id, eventId)) : [];
  const { yearBe, bundles } = await getReportBundles();
  const selected = bundles.filter(
    (b) =>
      b.eventId === eventId &&
      (groupIds.size === 0 || groupIds.has(b.subjectGroupId ?? -1)) &&
      (levels.size === 0 || b.levels.some((lv) => levels.has(lv)))
  );

  if (!event || !selected.length) {
    return <div style={{ padding: 40 }}>ไม่พบรายการที่ต้องการพิมพ์</div>;
  }

  return (
    <div className="report-print-root">
      <PrintControls />
      <div className="report-paper">
        {docType === "venues" ? (
          <VenueUsageSheet bundles={selected} eventName={event.name} yearBe={yearBe} />
        ) : docType === "catalog" ? (
          <CatalogSheet
            bundles={selected}
            eventName={event.name}
            yearBe={yearBe}
            splitByGroup={sp.split === "group"}
            levelFilter={[...levels]}
          />
        ) : SUMMARY_DOCS.includes(docType) ? (
          <SummarySheet
            bundles={selected}
            docType={docType as "summary" | "regcount"}
            eventName={event.name}
            yearBe={yearBe}
          />
        ) : (
          selected.map((b) => <ReportSheet key={b.id} bundle={b} docType={docType} eventName={event.name} />)
        )}
      </div>
    </div>
  );
}
