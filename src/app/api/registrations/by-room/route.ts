import { db } from "@/db";
import { competitions, competitionCapacity, entries, entryMembers, events, subjectGroups } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { listStudentsInRoom, studentFullName } from "@/lib/external/student-api";
import { fetchTeacherHomerooms } from "@/lib/external/teacher-api";
import { parseJsonArray, type RoomComp, type RoomStudent } from "@/lib/domain";

/**
 * GET: นักเรียนทั้งห้อง + รายการแข่งขันที่แต่ละคนสมัครไว้ (ปีการศึกษาปัจจุบัน)
 * + รายการแข่งขันที่เปิดรับระดับชั้นนี้ (ให้ครู/แอดมินกดสมัครแทนนักเรียน)
 *
 * สิทธิ์: admin ดูได้ทุกห้อง — ครู/recorder ดูได้เฉพาะห้องที่ตัวเองเป็นครูประจำชั้น (จาก SchoolOS)
 */
export async function GET(req: Request) {
  return handle(async () => {
    const session = await apiRequireRole("teacher", "recorder", "admin");
    const { searchParams } = new URL(req.url);
    const classLevel = searchParams.get("class_level") ?? "";
    const classRoom = searchParams.get("class_room") ?? "";
    if (!classLevel || !classRoom) return fail("กรุณาเลือกระดับชั้นและห้อง");

    // ครูทั่วไป — ต้องเป็นครูประจำชั้นของห้องที่ขอดูเท่านั้น (บังคับฝั่ง server ไม่ใช่แค่ UI)
    if (session.role !== "admin") {
      let homerooms;
      try {
        homerooms = await fetchTeacherHomerooms(session.code);
      } catch {
        return fail("ตรวจสอบข้อมูลครูประจำชั้นไม่สำเร็จ กรุณาลองใหม่", 502);
      }
      const mine = homerooms.some((h) => h.classLevel === classLevel && h.classRoom === classRoom);
      if (!mine) return fail("ดูได้เฉพาะห้องที่คุณเป็นครูประจำชั้นเท่านั้น", 403);
    }

    let profiles;
    try {
      profiles = await listStudentsInRoom(classLevel, classRoom);
    } catch {
      return fail("ดึงรายชื่อนักเรียนไม่สำเร็จ กรุณาลองใหม่", 502);
    }

    const students: RoomStudent[] = profiles.map((p) => ({
      studentCode: p.student_code,
      name: studentFullName(p),
      classLevel: p.class_level,
      classRoom: p.class_room,
      registrations: [],
    }));

    const year = await getActiveYear();
    if (!year) return ok({ students, yearBe: null, competitions: [] });

    const codes = students.map((s) => s.studentCode);

    // การสมัครที่ยัง active ของนักเรียนกลุ่มนี้ ในปีปัจจุบัน
    const rows = codes.length
      ? await db
          .select({
            studentCode: entryMembers.studentCode,
            entryId: entries.id,
            teamName: entries.teamName,
            competitionId: competitions.id,
            competitionName: competitions.name,
            eventDate: competitions.eventDate,
            eventId: competitions.eventId,
            groupName: subjectGroups.name,
          })
          .from(entryMembers)
          .innerJoin(entries, eq(entryMembers.entryId, entries.id))
          .innerJoin(competitions, eq(entries.competitionId, competitions.id))
          .leftJoin(subjectGroups, eq(competitions.subjectGroupId, subjectGroups.id))
          .where(
            and(
              inArray(entryMembers.studentCode, codes),
              eq(entries.status, "active"),
              eq(competitions.yearId, year.id)
            )
          )
      : [];

    const byCode = new Map(students.map((s) => [s.studentCode, s]));
    for (const r of rows) {
      byCode.get(r.studentCode)?.registrations.push({
        entryId: r.entryId,
        competitionId: r.competitionId,
        competitionName: r.competitionName,
        groupName: r.groupName ?? "-",
        teamName: r.teamName,
        eventDate: r.eventDate,
        eventId: r.eventId,
      });
    }

    // ===== รายการแข่งขันที่เปิดรับระดับชั้นนี้ (ปุ่ม "สมัครให้" ใช้เลือก) =====
    const compsThisYear = await db.select().from(competitions).where(eq(competitions.yearId, year.id));
    const eligible = compsThisYear.filter((c) => parseJsonArray(c.allowedClassLevels).includes(classLevel));

    const eventRows = await db.select().from(events).where(eq(events.yearId, year.id));
    const eventById = new Map(eventRows.map((e) => [e.id, e]));
    const now = new Date();
    const eventOpen = (id: number | null) => {
      const e = id == null ? null : eventById.get(id);
      if (!e || !e.registrationOpen) return false;
      if (e.regStart && now < new Date(e.regStart)) return false;
      if (e.regEnd && now > new Date(e.regEnd)) return false;
      return true;
    };

    const groups = await db.select().from(subjectGroups).where(eq(subjectGroups.yearId, year.id));
    const groupName = (id: number | null) => (id == null ? "ทั่วไป" : groups.find((g) => g.id === id)?.name ?? "-");

    const compIds = eligible.map((c) => c.id);
    const caps = compIds.length
      ? await db.select().from(competitionCapacity).where(inArray(competitionCapacity.competitionId, compIds))
      : [];

    const roomComps: RoomComp[] = eligible.map((c) => {
      const cRows = caps.filter((x) => x.competitionId === c.id);
      // ทีม หรือ เดี่ยวแบบรวมทุกชั้น → pool เดียว (class_level = null), เดี่ยวแยกชั้น → โควตาของชั้นนี้
      const capRow =
        c.type === "individual" && c.capacityMode !== "combined"
          ? cRows.find((r) => r.classLevel === classLevel)
          : cRows.find((r) => r.classLevel === null);
      return {
        id: c.id,
        name: c.name,
        type: c.type as RoomComp["type"],
        eventId: c.eventId,
        eventName: c.eventId != null ? eventById.get(c.eventId)?.name ?? "-" : "ทั่วไป",
        groupName: groupName(c.subjectGroupId),
        levels: parseJsonArray(c.allowedClassLevels),
        teamSizeMin: c.teamSizeMin,
        teamSizeMax: c.teamSizeMax,
        eventDate: c.eventDate,
        startTime: c.startTime,
        endTime: c.endTime,
        capacity: capRow?.capacity ?? 0,
        registered: capRow?.registeredCount ?? 0,
        open: eventOpen(c.eventId),
      };
    });

    return ok({ students, yearBe: year.yearBe, competitions: roomComps });
  });
}
