import "server-only";
import { db } from "@/db";
import { competitions, subjectGroups, competitionCapacity, competitionVenues, venues, type Competition } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getActiveYearWithSettings } from "@/lib/queries";
import { computeCompetitionResults } from "@/lib/results";
import { getRoster, type RosterEntry } from "@/lib/roster";
import { MEDAL_LABEL, parseJsonArray, isUnlimited, UNLIMITED_CAPACITY } from "@/lib/domain";

export type MedalPct = { gold: number; silver: number; bronze: number };

/** ข้อมูลเสริมสำหรับรายงานสรุป (สถานที่/จำนวนรับ) — คำนวณจาก getReportBundles */
export type BundleExtras = { venueName: string; capacity: number };

/** สร้างข้อมูลเอกสารของรายการแข่งขันเดียว (roster + คะแนน + อันดับ/เหรียญ) */
export async function buildBundle(
  comp: Competition,
  groupName: string,
  yearBe: number,
  medalPct: MedalPct,
  extras: BundleExtras = { venueName: "", capacity: 0 }
): Promise<ReportBundle> {
  const roster = await getRoster(comp.id);
  const computed = await computeCompetitionResults(comp.id, medalPct);
  return {
    id: comp.id,
    eventId: comp.eventId,
    subjectGroupId: comp.subjectGroupId,
    groupName,
    levels: parseJsonArray(comp.allowedClassLevels),
    teamSizeMin: comp.teamSizeMin,
    teamSizeMax: comp.teamSizeMax,
    venueName: extras.venueName,
    capacity: extras.capacity,
    meta: {
      competitionName: comp.name,
      groupName,
      type: comp.type as "individual" | "team",
      yearBe,
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
    studentCount: roster.reduce((s, e) => s + e.members.length, 0),
  };
}

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
  eventId: number | null;
  subjectGroupId: number | null;
  groupName: string;
  levels: string[]; // ระดับชั้นที่รับ
  teamSizeMin: number | null;
  teamSizeMax: number | null;
  venueName: string; // "อาคาร · ห้อง" หรือ "" ถ้าไม่ระบุ
  capacity: number; // < 0 = ไม่จำกัดจำนวน
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
  rosterCount: number; // จำนวน entry (เดี่ยว = คน, ทีม = ทีม)
  studentCount: number; // จำนวนนักเรียนรวมทุก entry
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
  const groupOf = (id: number | null) => (id == null ? undefined : groups.find((g) => g.id === id));

  // ข้อมูลเสริมสำหรับรายงานสรุป: สถานที่ + จำนวนรับ (ดึงเป็นชุดเดียว)
  const compIds = comps.map((c) => c.id);
  const caps = compIds.length
    ? await db.select().from(competitionCapacity).where(inArray(competitionCapacity.competitionId, compIds))
    : [];
  const venueRows = await db.select().from(venues);
  const compVenueRows = compIds.length
    ? await db.select().from(competitionVenues).where(inArray(competitionVenues.competitionId, compIds))
    : [];

  const bundles: ReportBundle[] = [];
  for (const comp of comps) {
    const g = groupOf(comp.subjectGroupId);
    const cRows = caps.filter((x) => x.competitionId === comp.id);
    // ถ้ามีแถวใดไม่จำกัด → ทั้งรายการถือว่าไม่จำกัด (เหมือน listCompetitions)
    const capacity = cRows.some((r) => isUnlimited(r.capacity))
      ? UNLIMITED_CAPACITY
      : cRows.reduce((s, r) => s + r.capacity, 0);
    // สถานที่ของรายการ (หลายห้องได้) — เรียงตามลำดับที่เลือกในฟอร์ม คั่นด้วยจุลภาค
    const venueName = compVenueRows
      .filter((cv) => cv.competitionId === comp.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((cv) => venueRows.find((x) => x.id === cv.venueId))
      .filter((v): v is (typeof venueRows)[number] => !!v)
      .map((v) => (v.building ? `${v.building} · ${v.name}` : v.name))
      .join(", ");
    bundles.push(await buildBundle(comp, g?.name ?? "-", year.yearBe, medalPct, { venueName, capacity }));
  }

  // เรียงตามหมวด แล้วตามชื่อรายการ ให้เอกสารออกมาเป็นระเบียบ
  bundles.sort((a, b) =>
    a.groupName.localeCompare(b.groupName, "th") || a.meta.competitionName.localeCompare(b.meta.competitionName, "th")
  );
  return { yearBe: year.yearBe, bundles };
}
