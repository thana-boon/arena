import { requireAdmin } from "@/lib/auth/guards";
import { getReportBundles } from "@/lib/reportBundle";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DOC_LABEL, SUMMARY_DOCS, type DocType, SummarySheet, ReportSheet } from "@/app/admin/reports/ReportSheets";
import { PrintControls } from "./PrintControls";

export const dynamic = "force-dynamic";

/** หน้าเอกสารสำหรับพิมพ์ (เปิดในแท็บใหม่จากหน้าออกรายงาน) — โชว์ตัวอย่างบนจอแล้วเด้งหน้าต่างพิมพ์อัตโนมัติ */
export default async function ReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; doc?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const eventId = Number(sp.event) || 0;
  const docType: DocType = (Object.keys(DOC_LABEL) as DocType[]).includes(sp.doc as DocType)
    ? (sp.doc as DocType)
    : "roster";

  const [event] = eventId ? await db.select().from(events).where(eq(events.id, eventId)) : [];
  const { yearBe, bundles } = await getReportBundles();
  const selected = bundles.filter((b) => b.eventId === eventId);

  if (!event || !selected.length) {
    return <div style={{ padding: 40 }}>ไม่พบรายการที่ต้องการพิมพ์</div>;
  }

  return (
    <div className="report-print-root">
      <PrintControls />
      <div className="report-paper">
        {SUMMARY_DOCS.includes(docType) ? (
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
