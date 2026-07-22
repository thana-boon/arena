import { db } from "@/db";
import { competitions, entries, entryMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { listAllStudents } from "@/lib/external/student-api";
import { CLASS_LEVELS, type RoomOverviewRow } from "@/lib/domain";

/**
 * GET: ภาพรวมการสมัครทุกห้อง (admin เท่านั้น) — แต่ละห้องมีนักเรียนกี่คน สมัครแล้วกี่คน
 * นับแบบเดียวกับหน้าห้องย่อย: สมัคร ≥ 1 รายการ (active, ปีปัจจุบัน) = นับว่าสมัครแล้ว
 * ?event_id=N → นับเฉพาะการสมัครในงานนั้น (ให้ตรงกับตัวกรอง "งาน" บนหน้า)
 */
export async function GET(req: Request) {
  return handle(async () => {
    await apiRequireRole("admin");
    const { searchParams } = new URL(req.url);
    const eventIdRaw = searchParams.get("event_id");
    const eventId = eventIdRaw ? Number(eventIdRaw) : null;

    const year = await getActiveYear();
    if (!year) return fail("ยังไม่มีปีการศึกษาที่เปิดใช้งาน");

    // นักเรียนทุกคนทุกห้องจาก SchoolOS (ทีละหน้า — ~10 requests)
    let students;
    try {
      students = await listAllStudents();
    } catch {
      return fail("ดึงรายชื่อนักเรียนไม่สำเร็จ กรุณาลองใหม่", 502);
    }

    // รหัสนักเรียนที่มีการสมัคร active ในปีนี้ (กรองตามงานได้)
    const regRows = await db
      .select({ code: entryMembers.studentCode })
      .from(entryMembers)
      .innerJoin(entries, eq(entryMembers.entryId, entries.id))
      .innerJoin(competitions, eq(entries.competitionId, competitions.id))
      .where(
        and(
          eq(entries.status, "active"),
          eq(competitions.yearId, year.id),
          ...(eventId != null ? [eq(competitions.eventId, eventId)] : [])
        )
      );
    const registeredCodes = new Set(regRows.map((r) => r.code));

    // จัดกลุ่มเป็นรายห้อง
    const map = new Map<string, RoomOverviewRow>();
    for (const s of students) {
      if (!s.class_level || !s.class_room) continue; // ไม่มีข้อมูลห้อง — ข้าม
      const key = `${s.class_level}|${s.class_room}`;
      const row = map.get(key) ?? { classLevel: s.class_level, classRoom: s.class_room, total: 0, registered: 0 };
      row.total += 1;
      if (registeredCodes.has(s.student_code)) row.registered += 1;
      map.set(key, row);
    }

    // เรียงตามลำดับระดับชั้น แล้วตามเลขห้อง
    const levelIndex = (l: string) => {
      const i = (CLASS_LEVELS as readonly string[]).indexOf(l);
      return i === -1 ? 999 : i;
    };
    const rooms = [...map.values()].sort((a, b) => {
      const d = levelIndex(a.classLevel) - levelIndex(b.classLevel);
      if (d !== 0) return d;
      const na = Number(a.classRoom), nb = Number(b.classRoom);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.classRoom.localeCompare(b.classRoom, "th");
    });

    const total = rooms.reduce((sum, r) => sum + r.total, 0);
    const registered = rooms.reduce((sum, r) => sum + r.registered, 0);

    return ok({ rooms, total, registered, yearBe: year.yearBe });
  });
}
