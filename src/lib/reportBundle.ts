import "server-only";
import { db } from "@/db";
import { competitions, subjectGroups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getActiveYearWithSettings } from "@/lib/queries";
import { computeCompetitionResults } from "@/lib/results";
import { getRoster, type RosterEntry } from "@/lib/roster";
import { MEDAL_LABEL } from "@/lib/domain";

export type ReportResultRow = {
  entryId: number;
  teamName: string | null;
  members: { studentCode: string; name: string; classLevel: string; classRoom: string }[];
  scoresByCriterion: Record<number, number>;
  total: number;
  percent: number;
  rank: number;
  medalLabel: string;
};

export type ReportBundle = {
  id: number;
  subjectGroupId: number;
  groupName: string;
  meta: {
    competitionName: string;
    groupName: string;
    type: "individual" | "team";
    yearBe: number;
    eventDate: string | null;
    startTime: string | null;
    endTime: string | null;
  };
  criteria: { id: number; name: string; max: number }[];
  fullScore: number;
  roster: RosterEntry[];
  results: ReportResultRow[];
  rosterCount: number;
};

/**
 * รวบรวมข้อมูลเอกสาร (ใบรายชื่อ/ใบกรอกคะแนน/ใบประกาศผล) ของทุกรายการในปีที่เปิดใช้งาน
 * ให้ admin เลือกติ๊ก/รวมออกเป็นชุดเดียวได้ — คำนวณฝั่งเซิร์ฟเวอร์ (อันดับ/เหรียญ)
 */
export async function getReportBundles(): Promise<{ yearBe: number; bundles: ReportBundle[] }> {
  const { year, setting } = await getActiveYearWithSettings();
  if (!year) return { yearBe: 0, bundles: [] };

  const medalPct = {
    gold: setting?.medalGoldPct ?? 80,
    silver: setting?.medalSilverPct ?? 70,
    bronze: setting?.medalBronzePct ?? 60,
  };

  const comps = await db.select().from(competitions).where(eq(competitions.yearId, year.id));
  const groups = await db.select().from(subjectGroups).where(eq(subjectGroups.yearId, year.id));
  const groupOf = (id: number) => groups.find((g) => g.id === id);

  const bundles: ReportBundle[] = [];
  for (const comp of comps) {
    const g = groupOf(comp.subjectGroupId);
    const roster = await getRoster(comp.id);
    const computed = await computeCompetitionResults(comp.id, medalPct);
    bundles.push({
      id: comp.id,
      subjectGroupId: comp.subjectGroupId,
      groupName: g?.name ?? "-",
      meta: {
        competitionName: comp.name,
        groupName: g?.name ?? "",
        type: comp.type as "individual" | "team",
        yearBe: year.yearBe,
        eventDate: comp.eventDate,
        startTime: comp.startTime,
        endTime: comp.endTime,
      },
      criteria: (computed?.criteria ?? []).map((c) => ({ id: c.id, name: c.name, max: Number(c.maxScore) })),
      fullScore: computed?.fullScore ?? 0,
      roster,
      results: (computed?.results ?? []).map((r) => ({
        entryId: r.entryId,
        teamName: r.teamName,
        members: r.members,
        scoresByCriterion: r.scoresByCriterion,
        total: r.total,
        percent: r.percent,
        rank: r.rank,
        medalLabel: MEDAL_LABEL[r.medal],
      })),
      rosterCount: roster.length,
    });
  }

  // เรียงตามหมวด แล้วตามชื่อรายการ ให้เอกสารออกมาเป็นระเบียบ
  bundles.sort((a, b) =>
    a.groupName.localeCompare(b.groupName, "th") || a.meta.competitionName.localeCompare(b.meta.competitionName, "th")
  );
  return { yearBe: year.yearBe, bundles };
}
