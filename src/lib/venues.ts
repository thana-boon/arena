import "server-only";
import { db } from "@/db";
import { competitions } from "@/db/schema";
import { and, eq, ne, lt, gt } from "drizzle-orm";

export type VenueConflict = {
  id: number;
  name: string;
  startTime: string | null;
  endTime: string | null;
};

/**
 * หารายการแข่งขันที่ใช้ "สถานที่เดียวกัน + วันเดียวกัน + เวลาแข่งขันคาบเกี่ยวกัน"
 * เงื่อนไข overlap: startTime < other.endTime AND endTime > other.startTime
 * (เทียบ time เป็น string "HH:MM:SS" ได้ตรง ๆ เพราะ same-day)
 * ผู้เรียกต้องมั่นใจว่ามี venueId + eventDate + start/end ครบก่อนเรียก
 */
export async function findVenueConflicts(opts: {
  venueId: number;
  eventDate: string;
  startTime: string;
  endTime: string;
  excludeId?: number;
}): Promise<VenueConflict[]> {
  const conds = [
    eq(competitions.venueId, opts.venueId),
    eq(competitions.eventDate, opts.eventDate),
    lt(competitions.startTime, opts.endTime),
    gt(competitions.endTime, opts.startTime),
  ];
  if (opts.excludeId) conds.push(ne(competitions.id, opts.excludeId));
  return db
    .select({
      id: competitions.id,
      name: competitions.name,
      startTime: competitions.startTime,
      endTime: competitions.endTime,
    })
    .from(competitions)
    .where(and(...conds));
}
