import { Icon } from "@/components/Icon";
import { db } from "@/db";
import { competitions, subjectGroups } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getActiveYearWithSettings } from "@/lib/queries";
import { computeCompetitionResults, competitionAllowedLevels } from "@/lib/results";
import { MEDAL_LABEL } from "@/lib/domain";
import { ResultsBrowser } from "./ResultsBrowser";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const { year, setting } = await getActiveYearWithSettings();
  if (!year) {
    return (
      <div className="empty-state card">
        <Icon name="chart" size={44} className="empty-ico" />
        <p>ยังไม่เปิดปีการศึกษา</p>
      </div>
    );
  }
  const medalPct = {
    gold: setting?.medalGoldPct ?? 80,
    silver: setting?.medalSilverPct ?? 70,
    bronze: setting?.medalBronzePct ?? 60,
  };

  const groups = await db.select().from(subjectGroups).where(eq(subjectGroups.yearId, year.id));
  // ประกาศผลเฉพาะ "งานเริ่มต้น" ที่ admin เลือกไว้ในหน้าตั้งค่า (ถ้ายังไม่ได้เลือก จะแสดงทุกงานของปีนั้น)
  const compConds = [eq(competitions.yearId, year.id), eq(competitions.isPublished, true)];
  if (setting?.defaultEventId != null) compConds.push(eq(competitions.eventId, setting.defaultEventId));
  const comps = await db
    .select()
    .from(competitions)
    .where(and(...compConds));

  const data = [];
  for (const c of comps) {
    const r = await computeCompetitionResults(c.id, medalPct);
    if (r) {
      data.push({
        id: c.id,
        name: c.name,
        type: c.type as "individual" | "team",
        groupId: c.subjectGroupId,
        levels: competitionAllowedLevels(c),
        criteria: r.criteria.map((cr) => ({ id: cr.id, name: cr.name, max: Number(cr.maxScore) })),
        fullScore: r.fullScore,
        results: r.results.map((e) => ({
          entryId: e.entryId,
          teamName: e.teamName,
          members: e.members,
          total: e.total,
          percent: e.percent,
          medal: e.medal,
          medalLabel: MEDAL_LABEL[e.medal],
          rank: e.rank,
        })),
      });
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>ผลการแข่งขัน</h1>
        <div className="subtitle">ปีการศึกษา {year.yearBe}</div>
      </div>
      <ResultsBrowser groups={groups.map((g) => ({ id: g.id, name: g.name }))} competitions={data} />
    </div>
  );
}
