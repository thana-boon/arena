import "server-only";
import { db } from "@/db";
import { competitions, subjectGroups, competitionCapacity, entries } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { parseJsonArray } from "@/lib/domain";

export type CompListItem = {
  id: number;
  name: string;
  type: "individual" | "team";
  subjectGroupId: number;
  groupCatalogNo: number | null;
  groupName: string;
  levels: string[];
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  isPublished: boolean;
  createdBy: string;
  capacity: number;
  registered: number;
  activeEntries: number;
};

export async function listCompetitions(yearId: number): Promise<CompListItem[]> {
  const comps = await db.select().from(competitions).where(eq(competitions.yearId, yearId));
  if (!comps.length) return [];
  const groups = await db.select().from(subjectGroups).where(eq(subjectGroups.yearId, yearId));
  const groupName = (id: number) => groups.find((g) => g.id === id)?.name ?? "-";
  const groupCatalogNo = (id: number) => groups.find((g) => g.id === id)?.catalogNo ?? null;
  const compIds = comps.map((c) => c.id);
  const caps = await db.select().from(competitionCapacity).where(inArray(competitionCapacity.competitionId, compIds));
  const ents = await db
    .select()
    .from(entries)
    .where(and(inArray(entries.competitionId, compIds), eq(entries.status, "active")));

  return comps.map((c) => {
    const cRows = caps.filter((x) => x.competitionId === c.id);
    return {
      id: c.id,
      name: c.name,
      type: c.type as "individual" | "team",
      subjectGroupId: c.subjectGroupId,
      groupCatalogNo: groupCatalogNo(c.subjectGroupId),
      groupName: groupName(c.subjectGroupId),
      levels: parseJsonArray(c.allowedClassLevels),
      eventDate: c.eventDate,
      startTime: c.startTime,
      endTime: c.endTime,
      isPublished: c.isPublished,
      createdBy: c.createdBy,
      capacity: cRows.reduce((s, r) => s + r.capacity, 0),
      registered: cRows.reduce((s, r) => s + r.registeredCount, 0),
      activeEntries: ents.filter((e) => e.competitionId === c.id).length,
    };
  });
}
