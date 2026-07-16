import "server-only";
import { db } from "@/db";
import { competitions, subjectGroups, competitionCapacity, entries } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { parseJsonArray, CLASS_LEVELS, UNLIMITED_CAPACITY, isUnlimited } from "@/lib/domain";
import { listStudents } from "@/lib/external/student-api";

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
  visibleToStudents: boolean;
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
      visibleToStudents: c.visibleToStudents,
      createdBy: c.createdBy,
      // ถ้ามีแถวใดไม่จำกัด → ทั้งรายการถือว่าไม่จำกัด (ไม่รวมเป็นตัวเลข)
      capacity: cRows.some((r) => isUnlimited(r.capacity)) ? UNLIMITED_CAPACITY : cRows.reduce((s, r) => s + r.capacity, 0),
      registered: cRows.reduce((s, r) => s + r.registeredCount, 0),
      activeEntries: ents.filter((e) => e.competitionId === c.id).length,
    };
  });
}

// ===== สรุปยอดรวมรายการแข่งขัน (สำหรับหน้า admin) =====
export type LevelSummary = {
  level: string;
  students: number; // จำนวนนักเรียนในระดับชั้น (จาก Student API)
  comps: number; // จำนวนรายการที่รับระดับชั้นนี้
  seats: number; // ที่นั่งเปิดรับที่ระดับชั้นนี้ลงได้ (รวมโควตา pool ทีม/รวมชั้น)
  sharedSeats: number; // ส่วนของ seats ที่มาจาก pool ที่ใช้ร่วมกับชั้นอื่น
  registered: number; // ลงทะเบียนแล้วเฉพาะโควตาแยกชั้น (per_level)
};

export type CompetitionsSummary = {
  totalComps: number;
  totalSeats: number; // นับแต่ละแถวโควตาครั้งเดียว (pool ไม่นับซ้ำ)
  totalRegistered: number;
  totalStudents: number;
  studentsError: boolean; // ดึงจำนวนนักเรียนจาก API ไม่สำเร็จ
  levels: LevelSummary[]; // เฉพาะชั้นที่มีนักเรียนหรือมีที่นั่ง
};

export async function getCompetitionsSummary(yearId: number): Promise<CompetitionsSummary> {
  const comps = await db.select().from(competitions).where(eq(competitions.yearId, yearId));
  const compIds = comps.map((c) => c.id);
  const caps = compIds.length
    ? await db.select().from(competitionCapacity).where(inArray(competitionCapacity.competitionId, compIds))
    : [];
  const compById = new Map(comps.map((c) => [c.id, c]));

  // สะสมที่นั่ง/ลงทะเบียน ต่อระดับชั้น
  const acc = new Map<string, { comps: number; seats: number; sharedSeats: number; registered: number }>();
  const bump = (lvl: string) => {
    let v = acc.get(lvl);
    if (!v) acc.set(lvl, (v = { comps: 0, seats: 0, sharedSeats: 0, registered: 0 }));
    return v;
  };

  // จำนวนรายการที่รับแต่ละชั้น (จาก allowedClassLevels)
  for (const c of comps) for (const lvl of parseJsonArray(c.allowedClassLevels)) bump(lvl).comps += 1;

  let totalSeats = 0;
  let totalRegistered = 0;
  for (const cap of caps) {
    // ไม่จำกัดจำนวน (capacity < 0) นับเป็น 0 ที่นั่งในสรุป เพื่อไม่ให้ยอดรวมเพี้ยน
    const seats = isUnlimited(cap.capacity) ? 0 : cap.capacity;
    totalSeats += seats;
    totalRegistered += cap.registeredCount;
    if (cap.classLevel) {
      // โควตาแยกชั้น (เดี่ยว per_level)
      const v = bump(cap.classLevel);
      v.seats += seats;
      v.registered += cap.registeredCount;
    } else {
      // โควตา pool (ทีม / เดี่ยวรวมชั้น) — ใช้ร่วมทุกชั้นที่รายการนี้รับ
      const comp = compById.get(cap.competitionId);
      const allowed = comp ? parseJsonArray(comp.allowedClassLevels) : [];
      for (const lvl of allowed) {
        const v = bump(lvl);
        v.seats += seats;
        v.sharedSeats += seats;
      }
    }
  }

  // จำนวนนักเรียนต่อระดับชั้น (Student API) — ยิงขนานทุกชั้น อ่านแค่ meta.total
  const studentsByLevel = new Map<string, number>();
  let studentsError = false;
  const results = await Promise.allSettled(
    CLASS_LEVELS.map((lvl) => listStudents({ class_level: lvl, page: 1, limit: 1 }))
  );
  results.forEach((r, i) => {
    if (r.status === "fulfilled") studentsByLevel.set(CLASS_LEVELS[i], r.value.meta.total);
    else studentsError = true;
  });

  // สร้างแถวเฉพาะชั้นที่มีนักเรียนหรือมีที่นั่ง เรียงตามลำดับ CLASS_LEVELS
  const levels: LevelSummary[] = CLASS_LEVELS.map((lvl) => {
    const v = acc.get(lvl);
    const students = studentsByLevel.get(lvl) ?? 0;
    return {
      level: lvl,
      students,
      comps: v?.comps ?? 0,
      seats: v?.seats ?? 0,
      sharedSeats: v?.sharedSeats ?? 0,
      registered: v?.registered ?? 0,
    };
  }).filter((r) => r.students > 0 || r.seats > 0 || r.comps > 0);

  const totalStudents = [...studentsByLevel.values()].reduce((s, n) => s + n, 0);

  return {
    totalComps: comps.length,
    totalSeats,
    totalRegistered,
    totalStudents,
    studentsError,
    levels,
  };
}
