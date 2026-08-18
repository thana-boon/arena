import { db } from "@/db";
import {
  certificateIssues,
  competitions,
  competitionCapacity,
  entries,
  entryMembers,
  events,
  subjectGroups,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { canRegisterHiddenCompetition } from "@/lib/permit";
import { getActiveYear } from "@/lib/queries";
import { listStudentsInRoom, studentFullName } from "@/lib/external/student-api";
import { fetchTeacherHomerooms } from "@/lib/external/teacher-api";
import {
  certIssueGate,
  parseJsonArray,
  registrationWindow,
  type CertAward,
  type RoomCert,
  type RoomComp,
  type RoomStudent,
} from "@/lib/domain";

/**
 * GET: นักเรียนทั้งห้อง + รายการแข่งขันที่แต่ละคนสมัครไว้ (ปีการศึกษาปัจจุบัน)
 * + รายการแข่งขันที่เปิดรับระดับชั้นนี้ (ให้ครู/แอดมินกดสมัครแทนนักเรียน)
 * + สถานะเกียรติบัตรของแต่ละการสมัคร (ครูประจำชั้นพิมพ์ใบทั้งห้องแจกเองได้)
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

    // งานทั้งหมดของปีนี้ — ใช้ทั้งเช็คว่าเกียรติบัตรออกได้หรือยัง และช่วงเปิดรับสมัครด้านล่าง
    const eventRows = await db.select().from(events).where(eq(events.yearId, year.id));
    const eventById = new Map(eventRows.map((e) => [e.id, e]));

    // การสมัครที่ยัง active ของนักเรียนกลุ่มนี้ ในปีปัจจุบัน
    // join เกียรติบัตรมาด้วย (เงื่อนไขตรงกับ unique index cert_issue_target_uniq → ได้ไม่เกิน 1 ใบต่อแถว)
    const rows = codes.length
      ? await db
          .select({
            studentCode: entryMembers.studentCode,
            absent: entryMembers.absent,
            entryId: entries.id,
            teamName: entries.teamName,
            competitionId: competitions.id,
            competitionName: competitions.name,
            eventDate: competitions.eventDate,
            eventId: competitions.eventId,
            noContest: competitions.noContest,
            isPublished: competitions.isPublished,
            attendanceCheckedAt: competitions.attendanceCheckedAt,
            groupName: subjectGroups.name,
            issueId: certificateIssues.id,
            serialNo: certificateIssues.serialNo,
            medal: certificateIssues.medal,
            rank: certificateIssues.rank,
            revokedAt: certificateIssues.revokedAt,
          })
          .from(entryMembers)
          .innerJoin(entries, eq(entryMembers.entryId, entries.id))
          .innerJoin(competitions, eq(entries.competitionId, competitions.id))
          .leftJoin(subjectGroups, eq(competitions.subjectGroupId, subjectGroups.id))
          .leftJoin(
            certificateIssues,
            and(
              eq(certificateIssues.competitionId, competitions.id),
              eq(certificateIssues.entryId, entries.id),
              eq(certificateIssues.studentCode, entryMembers.studentCode)
            )
          )
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
        cert: certOf(r, r.eventId == null ? null : eventById.get(r.eventId) ?? null),
      });
    }

    // ===== รายการแข่งขันที่เปิดรับระดับชั้นนี้ (ปุ่ม "สมัครให้" ใช้เลือก) =====
    const compsThisYear = await db.select().from(competitions).where(eq(competitions.yearId, year.id));

    const groups = await db.select().from(subjectGroups).where(eq(subjectGroups.yearId, year.id));
    const groupOf = (id: number | null) => (id == null ? null : groups.find((g) => g.id === id) ?? null);
    const groupName = (id: number | null) => (id == null ? "ทั่วไป" : groupOf(id)?.name ?? "-");
    // ไม่มีหมวด/หาไม่เจอ → ไว้ท้ายสุดของ dropdown
    const groupSort = (id: number | null) => groupOf(id)?.sortOrder ?? 9999;

    const eligible = compsThisYear.filter((c) => {
      if (!parseJsonArray(c.allowedClassLevels).includes(classLevel)) return false;
      // รายการที่ซ่อนจากนักเรียนไม่ใช่ของให้ครูประจำชั้นหยิบไปสมัครแทน — ตัดออกตั้งแต่ในลิสต์
      // จะได้ไม่เลือกไปแล้วโดน server ปฏิเสธทีหลัง (server ก็บังคับซ้ำอีกชั้นใน registerEntry)
      if (!c.visibleToStudents)
        return canRegisterHiddenCompetition(session, c.createdBy, groupOf(c.subjectGroupId)?.catalogNo ?? null);
      return true;
    });

    const now = new Date();
    const eventOpen = (id: number | null) =>
      registrationWindow(id == null ? null : eventById.get(id), now).open;

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
        groupSort: groupSort(c.subjectGroupId),
        levels: parseJsonArray(c.allowedClassLevels),
        teamSizeMin: c.teamSizeMin,
        teamSizeMax: c.teamSizeMax,
        allowCrossClass: c.allowCrossClass,
        eventDate: c.eventDate,
        startTime: c.startTime,
        endTime: c.endTime,
        capacity: capRow?.capacity ?? 0,
        registered: capRow?.registeredCount ?? 0,
        open: eventOpen(c.eventId),
        hiddenFromStudents: !c.visibleToStudents,
      };
    });

    return ok({ students, yearBe: year.yearBe, competitions: roomComps });
  });
}

/**
 * แปลงแถวการสมัคร 1 แถว เป็นสถานะเกียรติบัตรที่ครูประจำชั้นเข้าใจได้
 *
 * เงื่อนไขระดับงาน/รายการ ใช้ certIssueGate ตัวเดียวกับหน้า "ออกเกียรติบัตร" และทะเบียนเกียรติบัตร
 * (ถ้าตอบไม่ตรงกัน ครูประจำชั้นจะเห็นว่า "ยังไม่ได้ออก" ทั้งที่ครูเจ้าของรายการเห็นว่าออกไม่ได้)
 * ส่วนที่เพิ่มเองคือเงื่อนไขรายคน ซึ่ง gate ไม่รู้จัก: ไม่มาแข่ง / ใบถูกยกเลิก
 */
function certOf(
  r: {
    absent: boolean;
    noContest: boolean;
    isPublished: boolean;
    attendanceCheckedAt: Date | null;
    issueId: number | null;
    serialNo: string | null;
    medal: string | null;
    rank: number | null;
    revokedAt: Date | null;
  },
  ev: { kind: string; status: string } | null
): RoomCert {
  const none = { issueId: null, serialNo: null, award: null, rank: 0 };
  // ใบถูกยกเลิกไปแล้ว = ไม่มีอะไรให้พิมพ์ (QR ของใบนั้นตรวจสอบไม่ผ่านแล้ว)
  if (r.issueId != null && r.revokedAt != null) return { ...none, blockReason: "เกียรติบัตรถูกยกเลิก" };
  if (r.issueId != null)
    return {
      issueId: r.issueId,
      serialNo: r.serialNo,
      award: (r.medal as CertAward | null) ?? null,
      rank: r.rank ?? 0,
      blockReason: "",
    };

  const gate = certIssueGate(ev, {
    noContest: r.noContest,
    isPublished: r.isPublished,
    attendanceChecked: r.attendanceCheckedAt != null,
  });
  if (!gate.ready) return { ...none, blockReason: gate.reason };
  // ขาออกใบข้ามคนที่ไม่ได้มาเสมอ — ถ้าไม่บอกไว้ ครูจะรอใบที่ไม่มีวันมา
  if (r.absent)
    return { ...none, blockReason: r.noContest ? "เช็คชื่อแล้วว่าไม่ได้มาร่วม" : "ไม่มาแข่งขัน" };
  return { ...none, blockReason: "" };
}
