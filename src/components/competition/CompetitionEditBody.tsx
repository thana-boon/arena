import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { subjectGroups, competitions, competitionCapacity, criteria, entries, events } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getActiveYear, getTimeSlots, getVenues } from "@/lib/queries";
import { canEditCompetition } from "@/lib/permit";
import { canPickGroup } from "@/lib/groupScope";
import { parseJsonArray, isUnlimited } from "@/lib/domain";
import type { SessionPayload } from "@/lib/auth/session";
import { CompetitionForm } from "@/components/CompetitionForm";

/** เนื้อหาหน้าแก้ไขรายการแข่งขัน — ใช้ร่วมกันทั้ง /teacher และ /admin (ต่างกันแค่ปลายทาง returnTo) */
export async function CompetitionEditBody({
  id,
  session,
  returnTo,
}: {
  id: number;
  session: SessionPayload;
  returnTo: string;
}) {
  const year = await getActiveYear();
  if (!year) return <div className="alert alert-warning">ยังไม่มีปีการศึกษาที่เปิดใช้งาน</div>;

  const comp = (await db.select().from(competitions).where(eq(competitions.id, id)).limit(1))[0];
  if (!comp) return <div className="alert alert-error">ไม่พบรายการแข่งขัน</div>;
  if (!canEditCompetition(session, comp.createdBy)) redirect(returnTo);

  const allGroups = await db.select().from(subjectGroups).where(eq(subjectGroups.yearId, year.id));
  // ครูทั่วไปเลือกได้เฉพาะหมวดตัวเอง (แต่คงหมวดปัจจุบันของรายการไว้ให้เห็นเสมอ); admin เลือกได้ทุกหมวด
  const isAdmin = session.role === "admin";
  const groups = isAdmin
    ? allGroups
    : allGroups.filter((g) => canPickGroup(session, g.catalogNo) || g.id === comp.subjectGroupId);
  const caps = await db.select().from(competitionCapacity).where(eq(competitionCapacity.competitionId, id));
  const crits = await db.select().from(criteria).where(eq(criteria.competitionId, id));
  crits.sort((a, b) => a.sortOrder - b.sortOrder);
  const entRows = await db.select({ id: entries.id }).from(entries).where(eq(entries.competitionId, id)).limit(1);
  const locked = entRows.length > 0;
  const slots = await getTimeSlots(year.id);
  const venues = await getVenues();
  const eventList = await db.select().from(events).where(eq(events.yearId, year.id)).orderBy(asc(events.name));

  // ไม่จำกัดจำนวน = ทุกแถวโควตาเก็บค่า < 0 ; number field แสดง 0 แทนค่าลบ
  const unlimited = caps.length > 0 && caps.every((c) => isUnlimited(c.capacity));
  const clamp = (n: number) => (n < 0 ? 0 : n);
  const capPerLevel: Record<string, number> = {};
  for (const c of caps) if (c.classLevel) capPerLevel[c.classLevel] = clamp(c.capacity);
  const teamCap = clamp(caps.find((c) => c.classLevel === null)?.capacity ?? 0);
  const capacityMode = comp.capacityMode === "combined" ? "combined" : "per_level";
  // เดี่ยวแบบรวม เก็บโควตาไว้ที่ row เดียว (class_level = null) เหมือนทีม
  const combinedCapacity = capacityMode === "combined" ? teamCap : 0;

  return (
    <div className="stack form-page">
      <div>
        <Link href={returnTo} className="btn btn-ghost btn-sm">← กลับไปหน้ารายการแข่งขัน</Link>
      </div>
      <div className="page-header">
        <h1>แก้ไขรายการแข่งขัน</h1>
        <div className="subtitle">{comp.name}</div>
      </div>
      <CompetitionForm
        events={eventList.map((e) => ({ id: e.id, name: e.name, kind: e.kind, eventDate: e.eventDate }))}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        slots={slots.map((s) => ({ id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime }))}
        venues={venues.map((v) => ({ id: v.id, name: v.name, building: v.building }))}
        returnTo={returnTo}
        lockSubjectGroup={!isAdmin}
        initial={{
          id: comp.id,
          name: comp.name,
          description: comp.description ?? "",
          eventId: comp.eventId ?? "",
          subjectGroupId: comp.subjectGroupId ?? "",
          type: comp.type as "individual" | "team",
          visibleToStudents: comp.visibleToStudents,
          teamSizeMin: comp.teamSizeMin ?? "",
          teamSizeMax: comp.teamSizeMax ?? "",
          allowedClassLevels: parseJsonArray(comp.allowedClassLevels),
          timeSlotId: comp.timeSlotId ?? "",
          venueId: comp.venueId ?? "",
          eventDate: comp.eventDate ?? "",
          capacityMode,
          unlimited,
          capacityPerLevel: capPerLevel,
          combinedCapacity,
          teamCapacity: teamCap,
          criteria: crits.map((c) => ({ name: c.name, maxScore: Number(c.maxScore) })),
          locked,
        }}
      />
    </div>
  );
}
