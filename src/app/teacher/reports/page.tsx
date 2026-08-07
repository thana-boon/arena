import { requireStaff } from "@/lib/auth/guards";
import { getReportBundles } from "@/lib/reportBundle";
import { getActiveYearWithSettings } from "@/lib/queries";
import { db } from "@/db";
import { events } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { ReportsByEvent } from "@/app/admin/reports/ReportsByEvent";

export const dynamic = "force-dynamic";

/**
 * หน้าออกรายงานฝั่งครู — หน้าเดียวกับของ admin แต่เห็นเฉพาะรายการที่ตัวเองดูแล
 * (หมวดตัวเอง + รายการที่ตัวเองสร้าง) โดย getReportBundles เป็นคนกรองให้ตั้งแต่ต้นทาง
 */
export default async function TeacherReportsPage() {
  const session = await requireStaff();
  const { year, setting } = await getActiveYearWithSettings();
  const eventRows = year
    ? await db.select().from(events).where(eq(events.yearId, year.id)).orderBy(asc(events.name))
    : [];
  const { yearBe, bundles } = await getReportBundles(session);

  // งานที่ไม่มีรายการของครูคนนี้เลย ไม่ต้องโผล่ในตัวเลือก — เลือกไปก็ได้หน้าว่าง
  const visible = eventRows.filter((e) => bundles.some((b) => b.eventId === e.id));

  return (
    <ReportsByEvent
      yearBe={yearBe}
      events={visible.map((e) => ({ id: e.id, name: e.name }))}
      bundles={bundles}
      defaultEventId={setting?.defaultEventId ?? null}
      scopeHint={session.role === "teacher" ? "เห็นเฉพาะรายการในหมวดของตัวเองและรายการที่ตัวเองสร้าง" : null}
    />
  );
}
