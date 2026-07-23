import "server-only";
import { db } from "@/db";
import { competitions, competitionVenues, venues } from "@/db/schema";
import { and, eq, ne, lt, gt, inArray } from "drizzle-orm";

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

/** venue ids ของรายการหนึ่ง เรียงตามลำดับที่เลือกในฟอร์ม */
export async function getCompetitionVenueIds(competitionId: number): Promise<number[]> {
  const rows = await db
    .select({ venueId: competitionVenues.venueId, sortOrder: competitionVenues.sortOrder })
    .from(competitionVenues)
    .where(eq(competitionVenues.competitionId, competitionId));
  return rows.sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.venueId);
}
