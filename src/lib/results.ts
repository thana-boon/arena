import "server-only";
import { db } from "@/db";
import { competitions, criteria, entries, entryMembers, scores, competitionCapacity } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { decideMedal, scorePercent, type Medal, parseJsonArray } from "@/lib/domain";

export type EntryResult = {
  entryId: number;
  teamName: string | null;
  members: { studentCode: string; name: string; classLevel: string; classRoom: string }[];
  total: number;
  fullScore: number;
  percent: number;
  medal: Medal;
  rank: number;
  scoresByCriterion: Record<number, number>;
};

export type CompetitionResults = {
  competition: typeof competitions.$inferSelect;
  criteria: (typeof criteria.$inferSelect)[];
  fullScore: number;
  results: EntryResult[];
};

/** คำนวณผล + จัดอันดับ + เหรียญ ของ 1 รายการ */
export async function computeCompetitionResults(
  competitionId: number,
  medalPct: { gold: number; silver: number; bronze: number }
): Promise<CompetitionResults | null> {
  const compRows = await db.select().from(competitions).where(eq(competitions.id, competitionId)).limit(1);
  const comp = compRows[0];
  if (!comp) return null;

  const critRows = await db
    .select()
    .from(criteria)
    .where(eq(criteria.competitionId, competitionId));
  critRows.sort((a, b) => a.sortOrder - b.sortOrder);
  const fullScore = critRows.reduce((s, c) => s + Number(c.maxScore), 0);

  const entryRows = await db
    .select()
    .from(entries)
    .where(and(eq(entries.competitionId, competitionId), eq(entries.status, "active")));

  if (!entryRows.length) {
    return { competition: comp, criteria: critRows, fullScore, results: [] };
  }

  const entryIds = entryRows.map((e) => e.id);
  const memberRows = await db.select().from(entryMembers).where(inArray(entryMembers.entryId, entryIds));
  const scoreRows = await db.select().from(scores).where(inArray(scores.entryId, entryIds));

  const results: EntryResult[] = entryRows.map((e) => {
    const members = memberRows
      .filter((m) => m.entryId === e.id)
      .map((m) => ({
        studentCode: m.studentCode,
        name: m.nameSnapshot,
        classLevel: m.classLevelSnapshot,
        classRoom: m.classRoomSnapshot,
      }));
    const byCrit: Record<number, number> = {};
    let total = 0;
    for (const s of scoreRows.filter((s) => s.entryId === e.id)) {
      byCrit[s.criterionId] = Number(s.score);
      total += Number(s.score);
    }
    const percent = scorePercent(total, fullScore);
    return {
      entryId: e.id,
      teamName: e.teamName,
      members,
      total,
      fullScore,
      percent,
      medal: decideMedal(percent, medalPct.gold, medalPct.silver, medalPct.bronze),
      rank: 0,
      scoresByCriterion: byCrit,
    };
  });

  // มีคะแนนครบทุกเกณฑ์ถึงจัดอันดับ; ถ้ายังไม่มีคะแนนเลย total = 0
  results.sort((a, b) => b.total - a.total);
  let lastScore: number | null = null;
  let lastRank = 0;
  results.forEach((r, i) => {
    if (lastScore === null || r.total !== lastScore) {
      lastRank = i + 1;
      lastScore = r.total;
    }
    r.rank = lastRank;
  });

  return { competition: comp, criteria: critRows, fullScore, results };
}

export function competitionAllowedLevels(comp: typeof competitions.$inferSelect): string[] {
  return parseJsonArray(comp.allowedClassLevels);
}

/** สรุปจำนวนที่นั่ง (รวมทุกระดับ) ของรายการ */
export async function getCapacitySummary(competitionId: number) {
  const rows = await db
    .select()
    .from(competitionCapacity)
    .where(eq(competitionCapacity.competitionId, competitionId));
  const capacity = rows.reduce((s, r) => s + r.capacity, 0);
  const registered = rows.reduce((s, r) => s + r.registeredCount, 0);
  return { capacity, registered, rows };
}
