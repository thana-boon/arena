import "server-only";
import { db } from "@/db";
import {
  academicYears,
  certificateIssues,
  competitions,
  entries,
  entryMembers,
  events,
} from "@/db/schema";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { certIssueGate, type CertAward } from "@/lib/domain";

/**
 * ทะเบียนเกียรติบัตร — ค้นย้อนหลัง "ข้ามทุกปีการศึกษา"
 *
 * ทำไมต้องมีไฟล์นี้: หน้าออกเกียรติบัตรของครู/แอดมินผูกกับปีที่เปิดใช้งานอยู่เสมอ
 * (listCompetitions(year.id)) พอขึ้นปีใหม่ ศิษย์เก่าที่มาขอใบของปีก่อนจึงหาไม่เจอบนหน้าจอ
 * ที่นี่จึงตั้งใจ "ไม่กรองปี" เลย และอ่านจากฐานข้อมูลเราเองล้วน ไม่แตะ SchoolOS API
 *
 * เหตุผลที่ไม่พึ่ง API: /students ผูกกับ enrollment ของปีที่ถาม (inner join) เด็กที่ลาออก
 * ไปแล้วจะหายจากผลค้นทันทีที่ขึ้นปีใหม่ แม้ส่ง status=all และเด็กที่ถูก archive หายจากทุก
 * endpoint — แต่ entry_members/certificate_issues เก็บ snapshot ไว้ครบ จึงหาเจอเสมอ
 */

export type RegistryRow = {
  key: string;
  studentCode: string;
  name: string;
  classText: string;
  yearBe: number;
  eventName: string;
  competitionId: number;
  competitionName: string;
  teamName: string | null;
  entryId: number;
  withdrawn: boolean;
  /** เกียรติบัตรที่ออกแล้ว — null = ยังไม่เคยออกใบให้คนนี้ในรายการนี้ */
  issueId: number | null;
  serialNo: string | null;
  award: CertAward | null;
  rank: number;
  revoked: boolean;
  /** ยังไม่เคยออกใบ แล้วกดออกตอนนี้ได้ไหม (เงื่อนไขเดียวกับหน้า "ออกเกียรติบัตร") */
  canIssue: boolean;
  blockReason: string;
};

/** escape ตัวอักษรพิเศษของ LIKE เพื่อให้ค้น "%" หรือ "_" ตรงตัวได้ */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

const classText = (level: string, room: string) => [level, room].filter(Boolean).join("/");

/** เพดานผลลัพธ์ต่อการค้นหนึ่งครั้ง — กันเผลอค้นคำกว้าง ๆ แล้วลากทั้งตารางมา */
const MAX_ROWS = 400;

/**
 * ค้นด้วยรหัสนักเรียนหรือชื่อ (contains) — คืนทุกครั้งที่คนนั้นเข้าร่วมรายการแข่งขัน ทุกปี
 * พร้อมสถานะว่าเกียรติบัตรออกไปแล้วหรือยัง
 */
export async function searchRegistry(q: string): Promise<RegistryRow[]> {
  const term = q.trim();
  if (!term) return [];
  const pattern = `%${escapeLike(term)}%`;

  // (1) รายชื่อผู้เข้าร่วมจาก roster + จับคู่ใบที่ออกแล้ว (ถ้ามี)
  //     เงื่อนไข join ตรงกับ unique index cert_issue_target_uniq → ได้ไม่เกิน 1 ใบต่อแถว
  const participations = await db
    .select({
      studentCode: entryMembers.studentCode,
      name: entryMembers.nameSnapshot,
      classLevel: entryMembers.classLevelSnapshot,
      classRoom: entryMembers.classRoomSnapshot,
      absent: entryMembers.absent,
      entryId: entries.id,
      teamName: entries.teamName,
      entryStatus: entries.status,
      competitionId: competitions.id,
      competitionName: competitions.name,
      noContest: competitions.noContest,
      attendanceCheckedAt: competitions.attendanceCheckedAt,
      isPublished: competitions.isPublished,
      yearBe: academicYears.yearBe,
      eventId: events.id,
      eventName: events.name,
      eventKind: events.kind,
      eventStatus: events.status,
      issueId: certificateIssues.id,
      serialNo: certificateIssues.serialNo,
      medal: certificateIssues.medal,
      rank: certificateIssues.rank,
      revokedAt: certificateIssues.revokedAt,
    })
    .from(entryMembers)
    .innerJoin(entries, eq(entries.id, entryMembers.entryId))
    .innerJoin(competitions, eq(competitions.id, entries.competitionId))
    .innerJoin(academicYears, eq(academicYears.id, competitions.yearId))
    .leftJoin(events, eq(events.id, competitions.eventId))
    .leftJoin(
      certificateIssues,
      and(
        eq(certificateIssues.competitionId, competitions.id),
        eq(certificateIssues.entryId, entries.id),
        eq(certificateIssues.studentCode, entryMembers.studentCode)
      )
    )
    .where(or(ilike(entryMembers.studentCode, pattern), ilike(entryMembers.nameSnapshot, pattern)))
    .orderBy(desc(academicYears.yearBe), asc(competitions.name))
    .limit(MAX_ROWS);

  const rows: RegistryRow[] = participations.map((r) => {
    const withdrawn = r.entryStatus !== "active";
    // เงื่อนไขระดับงาน/รายการ มาจากฟังก์ชันเดียวกับหน้า "ออกเกียรติบัตร" และ API ขาออกใบ
    const gate = certIssueGate(
      r.eventId == null ? null : { kind: r.eventKind ?? "", status: r.eventStatus ?? "" },
      { noContest: r.noContest, isPublished: r.isPublished, attendanceChecked: r.attendanceCheckedAt != null }
    );
    // ที่เหลือเป็นเงื่อนไขรายคน ซึ่ง certIssueGate ไม่รู้จัก (เป็นของแถวนี้แถวเดียว)
    let blockReason = gate.reason;
    if (!blockReason) {
      if (withdrawn) blockReason = "ถอนการสมัครแล้ว";
      // ขาออกใบข้ามคนที่ไม่ได้มาเสมอ — ถ้าไม่บอกไว้ที่นี่ ปุ่ม "ออกใบ" จะกดได้แต่ไม่มีใบโผล่มา
      else if (r.absent)
        blockReason = r.noContest ? "เช็คชื่อแล้วว่าไม่ได้มาร่วม" : "ติ๊กไว้ว่าไม่มาแข่งขัน";
    }

    return {
      key: `p-${r.entryId}-${r.studentCode}`,
      studentCode: r.studentCode,
      name: r.name,
      classText: classText(r.classLevel, r.classRoom),
      yearBe: r.yearBe,
      eventName: r.eventName ?? "",
      competitionId: r.competitionId,
      competitionName: r.competitionName,
      teamName: r.teamName,
      entryId: r.entryId,
      withdrawn,
      issueId: r.issueId,
      serialNo: r.serialNo,
      award: (r.medal as CertAward | null) ?? null,
      rank: r.rank ?? 0,
      revoked: r.revokedAt != null,
      canIssue: r.issueId == null && blockReason === "",
      blockReason,
    };
  });

  // (2) ใบที่ออกไปแล้วแต่ชื่อถูกถอดออกจาก roster ทีหลัง — ใบยังอยู่ในมือนักเรียน
  //     ต้องหาเจอด้วย ไม่งั้นคนที่ถือใบจริงกลับกลายเป็นค้นไม่พบ
  //     ใช้ snapshot ในทะเบียนล้วน ไม่ต้อง join อะไรเพิ่ม
  const orphans = await db
    .select()
    .from(certificateIssues)
    .where(
      and(
        or(
          ilike(certificateIssues.studentCode, pattern),
          ilike(certificateIssues.nameSnapshot, pattern)
        ),
        sql`NOT EXISTS (
          SELECT 1 FROM entry_members em
          WHERE em.entry_id = ${certificateIssues.entryId}
            AND em.student_code = ${certificateIssues.studentCode}
        )`
      )
    )
    .orderBy(desc(certificateIssues.yearBeSnapshot))
    .limit(MAX_ROWS);

  for (const o of orphans) {
    rows.push({
      key: `o-${o.id}`,
      studentCode: o.studentCode,
      name: o.nameSnapshot,
      classText: o.classSnapshot,
      yearBe: o.yearBeSnapshot,
      eventName: o.eventNameSnapshot,
      competitionId: o.competitionId,
      competitionName: o.competitionNameSnapshot,
      teamName: o.teamNameSnapshot,
      entryId: o.entryId,
      withdrawn: false,
      issueId: o.id,
      serialNo: o.serialNo,
      award: o.medal as CertAward,
      rank: o.rank,
      revoked: o.revokedAt != null,
      canIssue: false,
      blockReason: "",
    });
  }

  // ปีใหม่สุดขึ้นก่อน แล้วเรียงตามคน → งาน → รายการ ให้ใบของคนเดียวกันอยู่ติดกัน
  rows.sort(
    (a, b) =>
      b.yearBe - a.yearBe ||
      a.studentCode.localeCompare(b.studentCode) ||
      a.eventName.localeCompare(b.eventName, "th") ||
      a.competitionName.localeCompare(b.competitionName, "th")
  );
  return rows;
}
