import "server-only";
import { db } from "@/db";
import { competitions, competitionVenues, subjectGroups, venues } from "@/db/schema";
import { and, asc, eq, ne, lt, gt, inArray } from "drizzle-orm";

export type VenueConflict = {
  id: number;
  name: string;
  venueName: string; // ห้องที่ชน (ระบุห้องเพราะรายการหนึ่งใช้ได้หลายห้อง)
  startTime: string | null;
  endTime: string | null;
};

/**
 * หารายการแข่งขันที่ใช้ "ห้องใดห้องหนึ่งใน venueIds + วันเดียวกัน + เวลาแข่งขันคาบเกี่ยวกัน"
 * เงื่อนไข overlap: startTime < other.endTime AND endTime > other.startTime
 * (เทียบ time เป็น string "HH:MM:SS" ได้ตรง ๆ เพราะ same-day)
 * ผู้เรียกต้องมั่นใจว่ามี venueIds + eventDate + start/end ครบก่อนเรียก
 */
export async function findVenueConflicts(opts: {
  venueIds: number[];
  eventDate: string;
  startTime: string;
  endTime: string;
  excludeId?: number;
}): Promise<VenueConflict[]> {
  if (!opts.venueIds.length) return [];
  const conds = [
    inArray(competitionVenues.venueId, opts.venueIds),
    eq(competitions.eventDate, opts.eventDate),
    lt(competitions.startTime, opts.endTime),
    gt(competitions.endTime, opts.startTime),
  ];
  if (opts.excludeId) conds.push(ne(competitions.id, opts.excludeId));
  const rows = await db
    .select({
      id: competitions.id,
      name: competitions.name,
      venueName: venues.name,
      building: venues.building,
      startTime: competitions.startTime,
      endTime: competitions.endTime,
    })
    .from(competitionVenues)
    .innerJoin(competitions, eq(competitions.id, competitionVenues.competitionId))
    .innerJoin(venues, eq(venues.id, competitionVenues.venueId))
    .where(and(...conds));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    venueName: r.building ? `${r.building} · ${r.venueName}` : r.venueName,
    startTime: r.startTime,
    endTime: r.endTime,
  }));
}

/**
 * ชื่อสถานที่แบบอ่านง่าย ("อาคาร · ห้อง") ของหลายรายการพร้อมกัน
 * คืน Map: competitionId → รายชื่อห้อง เรียงตามลำดับที่เลือกในฟอร์ม (รายการที่ไม่ระบุห้องจะไม่มีคีย์)
 */
export async function getVenueLabelsByCompetition(compIds: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (!compIds.length) return out;
  const rows = await db
    .select({
      competitionId: competitionVenues.competitionId,
      sortOrder: competitionVenues.sortOrder,
      name: venues.name,
      building: venues.building,
    })
    .from(competitionVenues)
    .innerJoin(venues, eq(venues.id, competitionVenues.venueId))
    .where(inArray(competitionVenues.competitionId, compIds));
  for (const r of rows.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const label = r.building ? `${r.building} · ${r.name}` : r.name;
    const list = out.get(r.competitionId);
    if (list) list.push(label);
    else out.set(r.competitionId, [label]);
  }
  return out;
}

/**
 * รายการแข่งขันทั้งปี พร้อมห้องที่จอง — ใช้วาด "ผังการใช้ห้อง"
 *
 * ดึงทั้งปีทีเดียวแล้วให้ฝั่งจอสลับงาน/ช่วงเวลาเอง เพราะจำนวนรายการต่อปีอยู่ในหลักร้อย
 * (ถ้าแยกดึงรายงาน ทุกครั้งที่เปลี่ยนงานจะต้องรอเซิร์ฟเวอร์ ทั้งที่ข้อมูลก้อนเดียวกัน)
 * รายการที่ยังไม่ได้เลือกห้องจะได้ venueIds = [] (ผังเอาไปเตือนว่ายังไม่ระบุห้อง)
 */
export type ScheduledCompetition = {
  id: number;
  eventId: number | null;
  name: string;
  groupName: string;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  venueIds: number[];
};

export async function getCompetitionSchedule(yearId: number): Promise<ScheduledCompetition[]> {
  const rows = await db
    .select({
      id: competitions.id,
      eventId: competitions.eventId,
      name: competitions.name,
      groupName: subjectGroups.name,
      eventDate: competitions.eventDate,
      startTime: competitions.startTime,
      endTime: competitions.endTime,
    })
    .from(competitions)
    .leftJoin(subjectGroups, eq(subjectGroups.id, competitions.subjectGroupId))
    .where(eq(competitions.yearId, yearId))
    .orderBy(asc(competitions.eventDate), asc(competitions.startTime), asc(competitions.name));
  if (!rows.length) return [];

  const links = await db
    .select({
      competitionId: competitionVenues.competitionId,
      venueId: competitionVenues.venueId,
      sortOrder: competitionVenues.sortOrder,
    })
    .from(competitionVenues)
    .where(inArray(competitionVenues.competitionId, rows.map((r) => r.id)));
  const byComp = new Map<number, { venueId: number; sortOrder: number }[]>();
  for (const l of links) {
    const list = byComp.get(l.competitionId);
    if (list) list.push(l);
    else byComp.set(l.competitionId, [l]);
  }

  return rows.map((r) => ({
    ...r,
    groupName: r.groupName ?? "",
    venueIds: (byComp.get(r.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder).map((l) => l.venueId),
  }));
}

/** venue ids ของรายการหนึ่ง เรียงตามลำดับที่เลือกในฟอร์ม */
export async function getCompetitionVenueIds(competitionId: number): Promise<number[]> {
  const rows = await db
    .select({ venueId: competitionVenues.venueId, sortOrder: competitionVenues.sortOrder })
    .from(competitionVenues)
    .where(eq(competitionVenues.competitionId, competitionId));
  return rows.sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.venueId);
}
