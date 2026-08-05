import { db } from "@/db";
import { competitions, subjectGroups, events } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getActiveYearWithSettings } from "@/lib/queries";
import { computeCompetitionResults } from "@/lib/results";
import { getRoster } from "@/lib/roster";
import { resolveClassNumbers, withClassNumbers } from "@/lib/classNumbers";
import { canViewCompetition } from "@/lib/permit";
import { MEDAL_LABEL } from "@/lib/domain";
import type { SessionPayload } from "@/lib/auth/session";
import type { SheetData } from "@/components/competition/CompetitionSheet";

/**
 * รวบรวมข้อมูลเอกสารของรายการแข่งขัน (หัวกระดาษ + รายชื่อ + ผลคะแนน)
 * ใช้ทั้งหน้าเอกสาร (พรีวิว) และหน้าพิมพ์ที่เปิดในแท็บใหม่ ให้ได้ข้อมูลชุดเดียวกันแน่นอน
 */
export async function loadCompetitionSheet(
  id: number,
  session: SessionPayload
): Promise<{ ok: true; data: SheetData } | { ok: false; error: string }> {
  const { year, setting } = await getActiveYearWithSettings();
  const comp = (await db.select().from(competitions).where(eq(competitions.id, id)).limit(1))[0];
  if (!comp) return { ok: false, error: "ไม่พบรายการแข่งขัน" };
  const group =
    comp.subjectGroupId == null
      ? undefined
      : (await db.select().from(subjectGroups).where(eq(subjectGroups.id, comp.subjectGroupId)).limit(1))[0];
  // ชื่องานบนหัวกระดาษ = ชื่อ "งาน" ที่ตั้งไว้ในหน้าตั้งค่า (ไม่ใช่ข้อความตายตัว)
  const event = comp.eventId == null ? undefined : (await db.select().from(events).where(eq(events.id, comp.eventId)).limit(1))[0];
  if (!canViewCompetition(session, comp.createdBy, group?.catalogNo))
    return { ok: false, error: "คุณไม่มีสิทธิ์เข้าถึงรายการนี้" };

  const medalPct = {
    gold: setting?.medalGoldPct ?? 80,
    silver: setting?.medalSilverPct ?? 70,
    bronze: setting?.medalBronzePct ?? 60,
  };
  const roster = await getRoster(id);
  const computed = await computeCompetitionResults(id, medalPct);

  // ใช้เลขที่ที่ freeze ไว้ตอนสมัคร — คนที่สมัครก่อนระบบเก็บเลขที่ค่อยถาม SchoolOS ให้
  const classNumbers = await resolveClassNumbers([
    ...roster.flatMap((e) => e.members),
    ...(computed?.results ?? []).flatMap((r) => r.members),
  ]);

  return {
    ok: true,
    data: {
      meta: {
        competitionName: comp.name,
        groupName: group?.name ?? "",
        type: comp.type as "individual" | "team",
        yearBe: year?.yearBe ?? 0,
        eventName: event?.name ?? "",
        eventDate: comp.eventDate,
        startTime: comp.startTime,
        endTime: comp.endTime,
      },
      criteria: (computed?.criteria ?? []).map((c) => ({ id: c.id, name: c.name, max: Number(c.maxScore) })),
      fullScore: computed?.fullScore ?? 0,
      roster: roster.map((e) => ({ ...e, members: withClassNumbers(e.members, classNumbers) })),
      results: (computed?.results ?? []).map((r) => ({
        entryId: r.entryId,
        teamName: r.teamName,
        members: withClassNumbers(r.members, classNumbers),
        scoresByCriterion: r.scoresByCriterion,
        total: r.total,
        percent: r.percent,
        rank: r.rank,
        medalLabel: MEDAL_LABEL[r.medal],
      })),
    },
  };
}
