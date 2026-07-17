import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { competitions, competitionCapacity, subjectGroups, entryMembers, entries, events } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getActiveYearWithSettings } from "@/lib/queries";
import { parseJsonArray } from "@/lib/domain";
import { BrowseRegister, type BrowseComp } from "./BrowseRegister";

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const session = await requireRole("student");
  const { year } = await getActiveYearWithSettings();
  if (!year) return <div className="alert alert-warning">ยังไม่เปิดปีการศึกษา</div>;

  const myLevel = session.classLevel ?? "";

  // งานที่นักเรียนเห็นได้ (visible) — เป็นเจ้าของการเปิด-ปิดรับสมัคร
  const eventRows = await db
    .select()
    .from(events)
    .where(and(eq(events.yearId, year.id), eq(events.visibleToStudents, true)));
  const eventById = new Map(eventRows.map((e) => [e.id, e]));
  const now = new Date();
  const eventOpen = (id: number | null) => {
    const e = id == null ? null : eventById.get(id);
    if (!e || !e.registrationOpen) return false;
    if (e.regStart && now < new Date(e.regStart)) return false;
    if (e.regEnd && now > new Date(e.regEnd)) return false;
    return true;
  };
  const registrationOpen = eventRows.some((e) => eventOpen(e.id));

  const visibleEventIds = eventRows.map((e) => e.id);
  const comps = visibleEventIds.length
    ? await db
        .select()
        .from(competitions)
        .where(
          and(
            eq(competitions.yearId, year.id),
            eq(competitions.visibleToStudents, true),
            inArray(competitions.eventId, visibleEventIds)
          )
        )
    : [];
  const eligible = comps.filter((c) => parseJsonArray(c.allowedClassLevels).includes(myLevel));

  const groups = await db.select().from(subjectGroups).where(eq(subjectGroups.yearId, year.id));
  const groupName = (id: number | null) => (id == null ? "ทั่วไป" : groups.find((g) => g.id === id)?.name ?? "-");
  const eventName = (id: number | null) => (id == null ? "ทั่วไป" : eventById.get(id)?.name ?? "-");

  const compIds = eligible.map((c) => c.id);
  const caps = compIds.length
    ? await db.select().from(competitionCapacity).where(inArray(competitionCapacity.competitionId, compIds))
    : [];

  // รายการที่ตัวเองลงแล้ว
  const myEntryIdsRows = await db
    .select({ entryId: entryMembers.entryId, competitionId: entries.competitionId })
    .from(entryMembers)
    .innerJoin(entries, eq(entryMembers.entryId, entries.id))
    .where(and(eq(entryMembers.studentCode, session.code), eq(entries.status, "active")));
  const registeredCompIds = new Set(myEntryIdsRows.map((r) => r.competitionId));
  const myEntryByComp = new Map(myEntryIdsRows.map((r) => [r.competitionId, r.entryId]));

  const data: BrowseComp[] = eligible.map((c) => {
    const cRows = caps.filter((x) => x.competitionId === c.id);
    let capacity = 0, registered = 0;
    if (c.type === "individual" && c.capacityMode !== "combined") {
      // แยกตามระดับชั้น → ดูโควตาของชั้นตัวเอง
      const row = cRows.find((r) => r.classLevel === myLevel);
      capacity = row?.capacity ?? 0;
      registered = row?.registeredCount ?? 0;
    } else {
      // ทีม หรือ เดี่ยวแบบรวมทุกชั้น → pool เดียว (class_level = null)
      const row = cRows.find((r) => r.classLevel === null);
      capacity = row?.capacity ?? 0;
      registered = row?.registeredCount ?? 0;
    }
    return {
      id: c.id,
      name: c.name,
      description: c.description ?? "",
      type: c.type as "individual" | "team",
      eventId: c.eventId,
      eventName: eventName(c.eventId),
      subjectGroupId: c.subjectGroupId,
      groupName: groupName(c.subjectGroupId),
      levels: parseJsonArray(c.allowedClassLevels),
      teamSizeMin: c.teamSizeMin,
      teamSizeMax: c.teamSizeMax,
      eventDate: c.eventDate,
      startTime: c.startTime,
      endTime: c.endTime,
      capacity,
      registered,
      alreadyRegistered: registeredCompIds.has(c.id),
      myEntryId: myEntryByComp.get(c.id) ?? null,
    };
  });

  return (
    <div className="stack">
      <div className="page-header">
        <h1>เลือกลงทะเบียน</h1>
        <div className="subtitle">
          ระดับชั้น {myLevel} · {registrationOpen ? "เปิดรับสมัคร" : "ปิดรับสมัคร"}
        </div>
      </div>
      {!registrationOpen && <div className="alert alert-warning">ขณะนี้ยังไม่มีงานที่เปิดรับสมัคร — ดูรายการได้แต่ยังลงทะเบียนไม่ได้</div>}
      <BrowseRegister
        comps={data}
        registrationOpen={registrationOpen}
        self={{ studentCode: session.code, name: session.name, classLevel: myLevel, classRoom: session.classRoom ?? "" }}
      />
    </div>
  );
}
