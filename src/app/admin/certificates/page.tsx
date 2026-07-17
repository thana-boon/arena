import { db } from "@/db";
import { events, competitions, certificateIssues } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getActiveYear } from "@/lib/queries";
import { Icon } from "@/components/Icon";
import { CertEventsManager } from "./CertEventsManager";

export const dynamic = "force-dynamic";

export default async function CertificatesPage() {
  const year = await getActiveYear();
  if (!year) {
    return (
      <div className="empty-state card">
        <Icon name="warning" size={44} className="empty-ico" />
        <p>ยังไม่เปิดปีการศึกษา — เปิดปีก่อนจึงจะสร้างงานเกียรติบัตรได้</p>
      </div>
    );
  }

  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.yearId, year.id))
    .orderBy(sql`${events.createdAt} desc`);

  // นับจำนวนรายการ + ใบที่ออกแล้วต่อแต่ละงาน
  const compCounts = await db
    .select({ eventId: competitions.eventId, n: sql<number>`count(*)::int` })
    .from(competitions)
    .where(eq(competitions.yearId, year.id))
    .groupBy(competitions.eventId);
  const issueCounts = await db
    .select({ eventId: certificateIssues.eventId, n: sql<number>`count(*)::int` })
    .from(certificateIssues)
    .groupBy(certificateIssues.eventId);

  const compMap = new Map(compCounts.map((r) => [r.eventId, r.n]));
  const issueMap = new Map(issueCounts.map((r) => [r.eventId, r.n]));

  const rows = eventRows.map((e) => ({
    id: e.id,
    name: e.name,
    kind: e.kind,
    eventDate: e.eventDate,
    status: e.status,
    visibleToStudents: e.visibleToStudents,
    registrationOpen: e.registrationOpen,
    competitionCount: compMap.get(e.id) ?? 0,
    issuedCount: issueMap.get(e.id) ?? 0,
  }));

  return (
    <div className="stack">
      <div className="page-header">
        <h1>งาน / เกียรติบัตร</h1>
        <div className="subtitle">
          สร้าง “งาน” (แข่งขัน/อบรม) ตั้งค่าการเปิดรับสมัคร-การมองเห็น และออกแบบเกียรติบัตร · รายการแข่งขันเลือกงานได้ที่หน้าสร้างรายการ · ปีการศึกษา {year.yearBe}
        </div>
      </div>
      <CertEventsManager events={rows} />
    </div>
  );
}
