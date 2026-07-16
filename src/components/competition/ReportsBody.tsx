import { db } from "@/db";
import { competitions, subjectGroups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getActiveYearWithSettings } from "@/lib/queries";
import { computeCompetitionResults } from "@/lib/results";
import { getRoster } from "@/lib/roster";
import { canViewCompetition } from "@/lib/permit";
import { MEDAL_LABEL } from "@/lib/domain";
import type { SessionPayload } from "@/lib/auth/session";
import { ReportsView } from "@/app/teacher/competitions/[id]/reports/ReportsView";

/** เนื้อหาหน้าเอกสาร/รายงาน — ใช้ร่วมกันทั้ง /teacher และ /admin */
export async function ReportsBody({
  id,
  session,
  basePath,
}: {
  id: number;
  session: SessionPayload;
  /** ราก path ของรายการแข่งขันตาม role ที่เข้ามา — ใช้ทำปุ่มย้อนกลับ */
  basePath: string;
}) {
  const { year, setting } = await getActiveYearWithSettings();
  const comp = (await db.select().from(competitions).where(eq(competitions.id, id)).limit(1))[0];
  if (!comp) return <div className="alert alert-error">ไม่พบรายการแข่งขัน</div>;
  const group = (await db.select().from(subjectGroups).where(eq(subjectGroups.id, comp.subjectGroupId)).limit(1))[0];
  if (!canViewCompetition(session, comp.createdBy, group?.catalogNo))
    return <div className="alert alert-error">คุณไม่มีสิทธิ์เข้าถึงรายการนี้</div>;

  const medalPct = {
    gold: setting?.medalGoldPct ?? 80,
    silver: setting?.medalSilverPct ?? 70,
    bronze: setting?.medalBronzePct ?? 60,
  };
  const roster = await getRoster(id);
  const computed = await computeCompetitionResults(id, medalPct);

  return (
    <ReportsView
      backHref={`${basePath}/${id}`}
      meta={{
        competitionName: comp.name,
        groupName: group?.name ?? "",
        type: comp.type as "individual" | "team",
        yearBe: year?.yearBe ?? 0,
        eventDate: comp.eventDate,
        startTime: comp.startTime,
        endTime: comp.endTime,
      }}
      criteria={(computed?.criteria ?? []).map((c) => ({ id: c.id, name: c.name, max: Number(c.maxScore) }))}
      fullScore={computed?.fullScore ?? 0}
      roster={roster}
      results={(computed?.results ?? []).map((r) => ({
        entryId: r.entryId,
        teamName: r.teamName,
        members: r.members,
        scoresByCriterion: r.scoresByCriterion,
        total: r.total,
        percent: r.percent,
        rank: r.rank,
        medalLabel: MEDAL_LABEL[r.medal],
      }))}
    />
  );
}
