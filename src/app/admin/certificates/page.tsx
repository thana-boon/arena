import { db } from "@/db";
import { certificateEvents, certificateEventCompetitions, certificateIssues } from "@/db/schema";
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

  const events = await db
    .select()
    .from(certificateEvents)
    .where(eq(certificateEvents.yearId, year.id))
    .orderBy(sql`${certificateEvents.createdAt} desc`);

  // นับจำนวนรายการแข่งขัน + ใบที่ออกแล้วต่อแต่ละงาน
  const compCounts = await db
    .select({ eventId: certificateEventCompetitions.eventId, n: sql<number>`count(*)::int` })
    .from(certificateEventCompetitions)
    .groupBy(certificateEventCompetitions.eventId);
  const issueCounts = await db
    .select({ eventId: certificateIssues.eventId, n: sql<number>`count(*)::int` })
    .from(certificateIssues)
    .groupBy(certificateIssues.eventId);

  const compMap = new Map(compCounts.map((r) => [r.eventId, r.n]));
  const issueMap = new Map(issueCounts.map((r) => [r.eventId, r.n]));

  const rows = events.map((e) => ({
    id: e.id,
    name: e.name,
    eventDate: e.eventDate,
    status: e.status,
    competitionCount: compMap.get(e.id) ?? 0,
    issuedCount: issueMap.get(e.id) ?? 0,
  }));

  return (
    <div className="stack">
      <div className="page-header">
        <h1>เกียรติบัตร</h1>
        <div className="subtitle">
          สร้าง “งาน” เช่น การแข่งขันวันวิชาการ แล้วเลือกรายการแข่งขัน ออกแบบพื้นหลัง/ลายเซ็น/ตำแหน่งข้อความ · ปีการศึกษา {year.yearBe}
        </div>
      </div>
      <CertEventsManager events={rows} />
    </div>
  );
}
