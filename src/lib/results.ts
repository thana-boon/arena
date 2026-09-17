import "server-only";
import { db } from "@/db";
import { getDefaultEvent, getYearWithSettings } from "@/lib/queries";
import {
  academicYears,
  competitions,
  criteria,
  entries,
  entryMembers,
  events,
  scores,
  competitionCapacity,
} from "@/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import {
  decideMedal,
  scorePercent,
  type Medal,
  type PublicCompResult,
  parseJsonArray,
  MEDAL_LABEL,
  UNLIMITED_CAPACITY,
  isUnlimited,
} from "@/lib/domain";

export type EntryResult = {
  entryId: number;
  teamName: string | null;
  /** absent = ลงทะเบียนไว้แต่ไม่มาแข่ง — ยังนับเป็นสมาชิกของ entry แต่ไม่ได้เกียรติบัตร */
  members: {
    studentCode: string;
    name: string;
    classLevel: string;
    classRoom: string;
    classNumber: string;
    absent: boolean;
  }[];
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
        classNumber: m.classNumberSnapshot,
        absent: m.absent,
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

/** งานหนึ่งในตัวกรอง "ดูผลของงานก่อนหน้า" ที่หน้าสาธารณะ */
export type PublicEventOption = {
  id: number;
  name: string;
  eventDate: string | null;
  yearId: number;
  yearBe: number;
  /** จำนวนรายการที่ประกาศผลแล้วในงานนั้น */
  publishedCount: number;
};

/**
 * งานที่ "มีอะไรให้ดู" ต่อสาธารณะ — มีรายการที่ประกาศผลแล้วอย่างน้อยหนึ่งรายการ
 * ข้ามปีการศึกษาโดยตั้งใจ: คนที่เข้ามาหาผลของงานปีที่แล้วต้องหาเจอโดยไม่ต้องให้แอดมินสลับปีให้
 * (รายการที่ยังไม่ประกาศ/ไม่มีการแข่งขัน ไม่ถูกนับ งานที่ไม่เหลืออะไรเลยจึงไม่โผล่ในตัวกรอง)
 */
export async function listPublicEvents(): Promise<PublicEventOption[]> {
  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      eventDate: events.eventDate,
      yearId: events.yearId,
      yearBe: academicYears.yearBe,
      publishedCount: sql<number>`count(${competitions.id})::int`,
    })
    .from(events)
    .innerJoin(academicYears, eq(academicYears.id, events.yearId))
    .innerJoin(
      competitions,
      and(
        eq(competitions.eventId, events.id),
        eq(competitions.isPublished, true),
        eq(competitions.noContest, false)
      )
    )
    .groupBy(events.id, events.name, events.eventDate, events.yearId, academicYears.yearBe)
    .orderBy(desc(academicYears.yearBe), desc(events.eventDate), desc(events.id));
  return rows;
}

/** งานที่จะแสดง (ตามที่ผู้ชมเลือก ถ้าไม่ได้เลือก/เลือกงานที่ไม่มีผล = งานเริ่มต้นของปีที่เปิดอยู่) */
export async function resolvePublicEvent(eventId?: number) {
  if (eventId != null) {
    const ev = (await db.select().from(events).where(eq(events.id, eventId)).limit(1))[0];
    if (ev) {
      const { year, setting } = await getYearWithSettings(ev.yearId);
      if (year) return { year, setting, event: ev };
    }
  }
  return getDefaultEvent();
}

/**
 * ขอบเขตของ "ผลที่ประกาศต่อสาธารณะได้" — งานที่เลือกดู (ไม่ได้เลือก = งานเริ่มต้นของปีที่เปิดอยู่)
 * เผยแพร่แล้วเท่านั้น และตัดรายการที่ไม่มีการแข่งขันออก (ไม่มีผล/อันดับให้ประกาศ)
 * ทั้งหน้า /results และ API ที่กล่องดูผลของหน้าแรกเรียก ต้องใช้กฎชุดนี้ชุดเดียวกัน
 *
 * เกณฑ์เหรียญมาจาก "ปีของงานที่กำลังดู" ไม่ใช่ปีที่เปิดใช้งาน — ไม่งั้นการย้อนดูงานปีก่อน
 * จะถูกตัดเหรียญด้วยเกณฑ์ของปีนี้ แล้วผลที่เห็นไม่ตรงกับใบที่แจกไปจริง
 *
 * compId = ขอเฉพาะรายการนั้น (กล่องดูผลของหน้าแรก) — ใช้ปี/งานของรายการนั้นเอง
 * เพื่อให้กดดูผลของงานที่ย้อนไปเลือกไว้ได้ ไม่ใช่เฉพาะงานเริ่มต้น
 */
export async function getPublicResultScope(opts: { compId?: number; eventId?: number } = {}) {
  const { compId } = opts;

  // ขอรายการเดียว: ยึดงาน/ปีของรายการนั้น (ยังต้องผ่านเกณฑ์ "ประกาศแล้ว" เหมือนกัน)
  const target =
    compId != null
      ? (await db.select().from(competitions).where(eq(competitions.id, compId)).limit(1))[0] ?? null
      : null;

  const { year, setting, event } = await resolvePublicEvent(
    target?.eventId ?? opts.eventId ?? undefined
  );
  const medalPct = {
    gold: setting?.medalGoldPct ?? 80,
    silver: setting?.medalSilverPct ?? 70,
    bronze: setting?.medalBronzePct ?? 60,
  };
  if (!year) return { year: null, setting, event, medalPct, comps: [] };

  const conds = [
    eq(competitions.yearId, year.id),
    eq(competitions.isPublished, true),
    eq(competitions.noContest, false),
  ];
  if (event) conds.push(eq(competitions.eventId, event.id));
  if (compId != null) conds.push(eq(competitions.id, compId));
  const comps = await db.select().from(competitions).where(and(...conds));
  return { year, setting, event, medalPct, comps };
}

/**
 * ผลของ 1 รายการสำหรับหน้าสาธารณะ (ใช้ทั้งหน้า /results และ API ที่กล่องดูผลของหน้าแรกเรียก)
 * คืน null เมื่อยังคำนวณผลไม่ได้ — ผู้เรียกตัดรายการนั้นทิ้งไปเลย
 */
export async function getPublicCompResult(
  comp: typeof competitions.$inferSelect,
  medalPct: { gold: number; silver: number; bronze: number }
): Promise<PublicCompResult | null> {
  const r = await computeCompetitionResults(comp.id, medalPct);
  if (!r) return null;
  return {
    id: comp.id,
    name: comp.name,
    type: comp.type === "team" ? "team" : "individual",
    groupId: comp.subjectGroupId,
    levels: competitionAllowedLevels(comp),
    criteria: r.criteria.map((cr) => ({ id: cr.id, name: cr.name, max: Number(cr.maxScore) })),
    fullScore: r.fullScore,
    results: r.results.map((e) => ({
      entryId: e.entryId,
      teamName: e.teamName,
      members: e.members.map((m) => ({
        studentCode: m.studentCode,
        name: m.name,
        classLevel: m.classLevel,
        classRoom: m.classRoom,
      })),
      total: e.total,
      percent: e.percent,
      medal: e.medal,
      medalLabel: MEDAL_LABEL[e.medal],
      rank: e.rank,
    })),
  };
}

/** สรุปจำนวนที่นั่ง (รวมทุกระดับ) ของรายการ */
export async function getCapacitySummary(competitionId: number) {
  const rows = await db
    .select()
    .from(competitionCapacity)
    .where(eq(competitionCapacity.competitionId, competitionId));
  // มีแถวใดไม่จำกัด → ทั้งรายการถือว่าไม่จำกัด (-1)
  const capacity = rows.some((r) => isUnlimited(r.capacity)) ? UNLIMITED_CAPACITY : rows.reduce((s, r) => s + r.capacity, 0);
  const registered = rows.reduce((s, r) => s + r.registeredCount, 0);
  return { capacity, registered, rows };
}
