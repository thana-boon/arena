import "server-only";
import { db } from "@/db";
import { entries, entryMembers, competitionCapacity } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export type RosterEntry = {
  entryId: number;
  teamName: string | null;
  members: { studentCode: string; name: string; classLevel: string; classRoom: string }[];
};

export async function getRoster(competitionId: number): Promise<RosterEntry[]> {
  const entRows = await db
    .select()
    .from(entries)
    .where(and(eq(entries.competitionId, competitionId), eq(entries.status, "active")));
  if (!entRows.length) return [];
  const members = await db.select().from(entryMembers);
  return entRows.map((e) => ({
    entryId: e.id,
    teamName: e.teamName,
    members: members
      .filter((m) => m.entryId === e.id)
      .map((m) => ({
        studentCode: m.studentCode,
        name: m.nameSnapshot,
        classLevel: m.classLevelSnapshot,
        classRoom: m.classRoomSnapshot,
      })),
  }));
}

export async function getCapacityRows(competitionId: number) {
  return db.select().from(competitionCapacity).where(eq(competitionCapacity.competitionId, competitionId));
}
