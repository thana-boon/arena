import { requireStaff } from "@/lib/auth/guards";
import { applyReportFilter, getReportBundles, parseReportFilter } from "@/lib/reportBundle";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq } from "drizzle-orm";
import { CatalogSheet, DOC_LABEL, SUMMARY_DOCS, type DocType, SummarySheet, VenueUsageSheet, ReportSheet } from "@/app/admin/reports/ReportSheets";
import { PrintControls } from "@/components/PrintControls";

export const dynamic = "force-dynamic";

/** หน้าเอกสารสำหรับพิมพ์ (เปิดในแท็บใหม่จากหน้าออกรายงาน) — โชว์ตัวอย่างบนจอแล้วเด้งหน้าต่างพิมพ์อัตโนมัติ */
export default async function ReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; doc?: string; groups?: string; levels?: string; split?: string }>;
}) {
  const session = await requireStaff();
  const sp = await searchParams;
  const docType: DocType = (Object.keys(DOC_LABEL) as DocType[]).includes(sp.doc as DocType)
    ? (sp.doc as DocType)
    : "roster";

  // ตัวกรองจากหน้าออกรายงาน (ไม่ส่งมา = เอาทุกหมวด/ทุกชั้น) — ต้องกรองแบบเดียวกับที่หน้านั้นแสดง
  const filter = parseReportFilter(sp);
  const { eventId, levels } = filter;

  const [event] = eventId ? await db.select().from(events).where(eq(events.id, eventId)) : [];
  // ขอบเขตคุมที่นี่ด้วย ไม่ใช่แค่หน้าเลือก — ครูแก้ ?groups= เองไม่ได้ผล
  const { yearBe, bundles } = await getReportBundles(session);
  const selected = applyReportFilter(bundles, filter);

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
