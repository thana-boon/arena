import { db } from "@/db";
import { competitions, entries, entryMembers, subjectGroups } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { listStudentsInRoom, studentFullName } from "@/lib/external/student-api";
import type { RoomStudent } from "@/lib/domain";

/**
 * GET: นักเรียนทั้งห้อง + รายการแข่งขันที่แต่ละคนสมัครไว้ (ปีการศึกษาปัจจุบัน)
 * เปิดให้ครูทุกคนและ admin ดูได้ (อ่านอย่างเดียว ไม่จำกัดตามหมวด)
 */
export async function GET(req: Request) {
  return handle(async () => {
    await apiRequireRole("teacher", "recorder", "admin");
    const { searchParams } = new URL(req.url);
    const classLevel = searchParams.get("class_level") ?? "";
    const classRoom = searchParams.get("class_room") ?? "";
    if (!classLevel || !classRoom) return fail("กรุณาเลือกระดับชั้นและห้อง");

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
    const codes = students.map((s) => s.studentCode);
    if (!year || !codes.length) return ok({ students, yearBe: year?.yearBe ?? null });

    // การสมัครที่ยัง active ของนักเรียนกลุ่มนี้ ในปีปัจจุบัน
    const rows = await db
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
      );

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

    return ok({ students, yearBe: year.yearBe });
  });
}
