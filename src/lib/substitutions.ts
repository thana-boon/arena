import "server-only";
import { db } from "@/db";
import { competitions, entries, entryMembers, entrySubstitutions, events, subjectGroups } from "@/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  formatThaiDateTime,
  parseJsonArray,
  substitutionSummary,
  substitutionWindow,
  type CompType,
} from "@/lib/domain";
import { canSubstitute, substitutionGuard } from "@/lib/permit";
import { getRoster, type RosterEntry } from "@/lib/roster";
import { listCompetitions, type CompListItem } from "@/lib/listings";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * ข้อมูลของหน้า "การเปลี่ยนตัว" — เดินสามชั้น: เลือกงาน → เลือกรายการ → เปลี่ยนตัวรายคน
 * (รูปแบบเดียวกับหน้าออกเกียรติบัตร ด้วยเหตุผลเดียวกัน: รายการทั้งปีรวมกันเป็นร้อย ไล่หาในตารางเดียวไม่ไหว)
 *
 * ใช้ร่วมกันทั้งมุมครู (/teacher/substitutions) และมุมแอดมิน (/admin/substitutions)
 * ต่างกันแค่เชลล์ที่ครอบอยู่ — เงื่อนไข "เปลี่ยนได้/ไม่ได้" ต้องมาจากที่เดียวกันเสมอ
 */

export type SubEventCard = {
  id: number;
  name: string;
  kind: string;
  eventDate: string | null;
  /** จำนวนรายการในงานนี้ที่ผู้ใช้คนนี้ดูแลอยู่ */
  compCount: number;
  /** ในนั้น เปลี่ยนตัวได้ตอนนี้กี่รายการ */
  openCount: number;
  /** จำนวนครั้งที่เปลี่ยนตัวไปแล้วในงานนี้ */
  subCount: number;
  /** สรุปช่วงเปลี่ยนตัวที่ผู้ดูแลตั้งไว้ (null = ปิดทั้งเดี่ยวและทีม) */
  window: { label: string; open: boolean } | null;
};

export type SubCompRow = {
  id: number;
  name: string;
  type: CompType;
  groupName: string;
  entryCount: number;
  memberCount: number;
  subCount: number;
  /** เปลี่ยนตัวในรายการนี้ได้ตอนนี้ไหม */
  allowed: boolean;
  /** ถ้าไม่ได้ เพราะอะไร */
  reason: string;
};

export type SubHistoryRow = {
  id: number;
  outName: string;
  outClass: string;
  inName: string;
  inClass: string;
  reason: string;
  byName: string;
  byCode: string;
  /** วัน-เวลาแบบไทยที่จัดรูปมาจากเซิร์ฟเวอร์แล้ว — ให้ client ไม่ต้องคิดเวลาเอง (SSR/hydration ตรงกันเสมอ) */
  createdAt: string;
};

export type SubCompDetail = {
  competition: {
    id: number;
    name: string;
    type: CompType;
    groupName: string;
    eventId: number | null;
    eventName: string;
    eventDate: string | null;
    startTime: string | null;
    endTime: string | null;
    allowedLevels: string[];
    allowCrossClass: boolean;
  };
  roster: RosterEntry[];
  history: SubHistoryRow[];
  /** เปลี่ยนตัวได้ตอนนี้ไหม + เหตุผลถ้าไม่ได้ */
  gate: { allowed: boolean; message: string };
  /**
   * สถานะช่วงเปลี่ยนตัวที่ผู้ดูแลตั้งไว้ (null = เปิดอยู่) — คิดโดยไม่สนใจ role
   * มีเพราะ gate ของ admin ผ่านเสมอ ถ้าไม่แยกค่านี้ไว้ admin จะไม่มีทางรู้เลยว่ากำลังเปลี่ยนนอกช่วงที่ตั้งไว้
   */
  windowReason: string | null;
  /** ผู้ใช้คนนี้เป็น admin (ข้ามช่วงเวลาได้) */
  isAdmin: boolean;
};

/** รายการในปีนี้ที่ผู้ใช้คนนี้เปลี่ยนตัวได้ (ครูเห็นเฉพาะหมวดตัวเอง) */
async function substitutableCompetitions(
  session: SessionPayload,
  yearId: number
): Promise<CompListItem[]> {
  const all = await listCompetitions(yearId);
  return all.filter((c) => canSubstitute(session, c.createdBy, c.groupCatalogNo));
}

/** จำนวนครั้งที่เปลี่ยนตัวไปแล้ว ต่อรายการแข่งขัน */
async function subCountByComp(compIds: number[]): Promise<Map<number, number>> {
  if (!compIds.length) return new Map();
  const rows = await db
    .select({ competitionId: entrySubstitutions.competitionId, n: sql<number>`count(*)::int` })
    .from(entrySubstitutions)
    .where(inArray(entrySubstitutions.competitionId, compIds))
    .groupBy(entrySubstitutions.competitionId);
  return new Map(rows.map((r) => [r.competitionId, r.n]));
}

/** ชั้นแรก: งานที่มีรายการของผู้ใช้คนนี้อยู่ */
export async function listSubEvents(
  session: SessionPayload,
  yearId: number
): Promise<{ events: SubEventCard[]; orphanCount: number }> {
  const comps = await substitutableCompetitions(session, yearId);
  const orphanCount = comps.filter((c) => c.eventId == null).length;

  const evs = await db.select().from(events).where(eq(events.yearId, yearId)).orderBy(asc(events.name));
  if (!evs.length) return { events: [], orphanCount };

  const subs = await subCountByComp(comps.map((c) => c.id));

  const cards: SubEventCard[] = [];
  for (const ev of evs) {
    const inEvent = comps.filter((c) => c.eventId === ev.id);
    if (!inEvent.length) continue;
    cards.push({
      id: ev.id,
      name: ev.name,
      kind: ev.kind,
      eventDate: ev.eventDate,
      compCount: inEvent.length,
      openCount: inEvent.filter(
        (c) => substitutionGuard(session, ev, c.type).allowed
      ).length,
      subCount: inEvent.reduce((s, c) => s + (subs.get(c.id) ?? 0), 0),
      window: substitutionSummary(ev),
    });
  }
  return { events: cards, orphanCount };
}

/** ชั้นสอง: รายการในงานที่เลือก — null = ไม่มีงานนี้ในปีที่เปิดอยู่ */
export async function getSubEvent(
  session: SessionPayload,
  yearId: number,
  eventId: number
): Promise<{ event: { id: number; name: string; eventDate: string | null }; rows: SubCompRow[] } | null> {
  const ev = (await db.select().from(events).where(eq(events.id, eventId)).limit(1))[0];
  if (!ev || ev.yearId !== yearId) return null;

  const comps = (await substitutableCompetitions(session, yearId)).filter((c) => c.eventId === eventId);
  const subs = await subCountByComp(comps.map((c) => c.id));

  // จำนวนผู้เข้าแข่งขัน (รายคน) ของแต่ละรายการ — ทีม 1 ใบสมัครมีหลายคน ตัวเลข "ใบสมัคร" อย่างเดียวสื่อไม่ครบ
  const memberCounts = comps.length
    ? await db
        .select({ competitionId: entries.competitionId, n: sql<number>`count(*)::int` })
        .from(entryMembers)
        .innerJoin(entries, eq(entryMembers.entryId, entries.id))
        .where(
          and(
            inArray(
              entries.competitionId,
              comps.map((c) => c.id)
            ),
            eq(entries.status, "active")
          )
        )
        .groupBy(entries.competitionId)
    : [];
  const memberMap = new Map(memberCounts.map((r) => [r.competitionId, r.n]));

  const rows: SubCompRow[] = comps
    .map((c) => {
      const gate = substitutionGuard(session, ev, c.type);
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        groupName: c.groupName,
        entryCount: c.activeEntries,
        memberCount: memberMap.get(c.id) ?? 0,
        subCount: subs.get(c.id) ?? 0,
        allowed: gate.allowed,
        reason: gate.message,
      };
    })
    .sort((a, b) => a.groupName.localeCompare(b.groupName, "th") || a.name.localeCompare(b.name, "th"));

  return { event: { id: ev.id, name: ev.name, eventDate: ev.eventDate }, rows };
}

/** ชั้นสาม: รายชื่อผู้เข้าแข่งขัน + ประวัติการเปลี่ยนตัวของรายการเดียว */
export async function getSubCompetition(
  session: SessionPayload,
  yearId: number,
  competitionId: number
): Promise<SubCompDetail | null> {
  const comp = (
    await db.select().from(competitions).where(eq(competitions.id, competitionId)).limit(1)
  )[0];
  if (!comp || comp.yearId !== yearId) return null;

  const group =
    comp.subjectGroupId == null
      ? null
      : (await db.select().from(subjectGroups).where(eq(subjectGroups.id, comp.subjectGroupId)).limit(1))[0] ??
        null;
  if (!canSubstitute(session, comp.createdBy, group?.catalogNo ?? null)) return null;

  const event = comp.eventId
    ? (await db.select().from(events).where(eq(events.id, comp.eventId)).limit(1))[0] ?? null
    : null;
  const type = comp.type as CompType;

  const roster = await getRoster(competitionId);
  const history = await db
    .select()
    .from(entrySubstitutions)
    .where(eq(entrySubstitutions.competitionId, competitionId))
    .orderBy(desc(entrySubstitutions.createdAt));

  return {
    competition: {
      id: comp.id,
      name: comp.name,
      type,
      groupName: group?.name ?? "",
      eventId: comp.eventId,
      eventName: event?.name ?? "",
      eventDate: comp.eventDate,
      startTime: comp.startTime,
      endTime: comp.endTime,
      allowedLevels: parseJsonArray(comp.allowedClassLevels),
      allowCrossClass: comp.allowCrossClass,
    },
    roster,
    history: history.map((h) => ({
      id: h.id,
      outName: h.outName,
      outClass: h.outClass,
      inName: h.inName,
      inClass: h.inClass,
      reason: h.reason,
      byName: h.byName,
      byCode: h.byCode,
      createdAt: formatThaiDateTime(h.createdAt),
    })),
    gate: substitutionGuard(session, event, type),
    windowReason: substitutionWindow(event, type).reason,
    isAdmin: session.role === "admin",
  };
}
