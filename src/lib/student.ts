import "server-only";
import { db } from "@/db";
import { competitions, entries, entryMembers, subjectGroups } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getVenueLabelsByCompetition } from "@/lib/venues";

export type StudentEntry = {
  entryId: number;
  competitionId: number;
  competitionName: string;
  type: "individual" | "team";
  teamName: string | null;
  groupName: string;
  /** งานที่รายการสังกัด — เจ้าของช่วงรับสมัคร (ใช้ตัดสินว่ายังยกเลิกเองได้ไหม) */
  eventId: number | null;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  /** สถานที่แข่งขัน ("อาคาร · ห้อง") — ว่างถ้ายังไม่ระบุ */
  venues: string[];
  members: { studentCode: string; name: string }[];
};

/** entries ที่ active ของนักเรียน ในปีที่กำหนด */
export async function getStudentEntries(studentCode: string, yearId: number): Promise<StudentEntry[]> {
  const myMemberships = await db
    .select({ entryId: entryMembers.entryId })
    .from(entryMembers)
    .where(eq(entryMembers.studentCode, studentCode));
  const entryIds = myMemberships.map((m) => m.entryId);
  if (!entryIds.length) return [];

  const entRows = await db
    .select()
    .from(entries)
    .where(and(inArray(entries.id, entryIds), eq(entries.status, "active")));
  if (!entRows.length) return [];

  const compIds = [...new Set(entRows.map((e) => e.competitionId))];
  const comps = await db.select().from(competitions).where(inArray(competitions.id, compIds));
  const compById = new Map(comps.map((c) => [c.id, c]));
  const groups = await db.select().from(subjectGroups).where(eq(subjectGroups.yearId, yearId));
  const groupName = (id: number | null) => (id == null ? "" : groups.find((g) => g.id === id)?.name ?? "-");

  const allMembers = await db.select().from(entryMembers).where(inArray(entryMembers.entryId, entRows.map((e) => e.id)));
  const venueLabels = await getVenueLabelsByCompetition(compIds);

  return entRows
    .filter((e) => compById.get(e.competitionId)?.yearId === yearId)
    .map((e) => {
      const c = compById.get(e.competitionId)!;
      return {
        entryId: e.id,
        competitionId: e.competitionId,
        competitionName: c.name,
        type: c.type as "individual" | "team",
        teamName: e.teamName,
        groupName: groupName(c.subjectGroupId),
        eventId: c.eventId,
        eventDate: c.eventDate,
        startTime: c.startTime,
        endTime: c.endTime,
        venues: venueLabels.get(e.competitionId) ?? [],
        members: allMembers
          .filter((m) => m.entryId === e.id)
          .map((m) => ({ studentCode: m.studentCode, name: m.nameSnapshot })),
      };
    });
}
