import "server-only";
import { db } from "@/db";
import {
  certificateIssues,
  competitions,
  entries,
  entryMembers,
  entrySubstitutions,
  events,
  subjectGroups,
} from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getActiveYearWithSettings } from "@/lib/queries";
import { parseJsonArray, type CompType } from "@/lib/domain";
import { canSubstitute, substitutionGuard } from "@/lib/permit";
import type { MemberInput } from "@/lib/registration";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * การเปลี่ยนตัวผู้เข้าแข่งขัน — เปลี่ยน "คนที่นั่งอยู่ในที่นั่งเดิม" ไม่ใช่ถอนแล้วลงใหม่
 *
 * ทำไมไม่ใช้ withdraw + register ที่มีอยู่แล้ว: ที่นั่งจะถูกคืนแล้วแย่งใหม่ (คนอื่นเสียบแทนได้ระหว่างนั้น)
 * ทีมจะเสียทั้งทีมทั้งที่เปลี่ยนคนเดียว คะแนนที่บันทึกไว้ผูกกับ entry เดิมจะหลุด และประวัติว่า
 * "เดิมเป็นใคร" หายไปทั้งหมด — การเปลี่ยนตัวคือแก้ที่แถว entry_members แถวเดิมแล้วบันทึกประวัติไว้
 *
 * กติกาที่ยังบังคับเหมือนตอนลงทะเบียน: ระดับชั้นที่รายการรับ · ทีมข้ามห้อง · ห้ามซ้ำในรายการเดียวกัน ·
 * เวลาแข่งต้องไม่ชนกับรายการอื่นที่คนใหม่ลงไว้ (ข้อนี้ห้ามข้ามแม้แต่ admin — ชนแล้วคือแข่งไม่ได้จริง ๆ)
 */

export class SubstitutionError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type SubstituteArgs = {
  /** entry_members.id ของที่นั่งที่จะเปลี่ยนคน */
  memberId: number;
  /** ข้อมูลคนใหม่ (route เป็นคน resolve จาก Student API มาให้ เหมือนตอนลงทะเบียน) */
  newMember: MemberInput;
  reason?: string;
  actor: SessionPayload;
};

export type SubstituteResult = {
  competitionId: number;
  competitionName: string;
  entryId: number;
  out: { studentCode: string; name: string };
  in: { studentCode: string; name: string };
};

/** ตรวจ overlap ช่วงเวลา (เวลาเป็น HH:MM:SS) — กติกาเดียวกับตอนลงทะเบียน */
function timeOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** "ป.5/2" — ข้อความชั้น/ห้องสำหรับเก็บลงประวัติและแสดงผล */
export const classText = (level: string, room: string): string =>
  [level, room].filter(Boolean).join("/");

/**
 * เปลี่ยนตัวผู้เข้าแข่งขัน 1 ที่นั่ง แบบ atomic
 * ที่นั่ง/โควตาไม่ขยับเลย (จำนวนคนเท่าเดิม) จึงไม่ต้องแตะ competition_capacity
 */
export async function substituteMember(args: SubstituteArgs): Promise<SubstituteResult> {
  const { actor, newMember } = args;
  const { year, setting } = await getActiveYearWithSettings();
  if (!year || !setting) throw new SubstitutionError("ยังไม่มีปีการศึกษาที่เปิดใช้งาน");

  const member = (
    await db.select().from(entryMembers).where(eq(entryMembers.id, args.memberId)).limit(1)
  )[0];
  if (!member) throw new SubstitutionError("ไม่พบผู้เข้าแข่งขันที่จะเปลี่ยน", 404);

  const entry = (await db.select().from(entries).where(eq(entries.id, member.entryId)).limit(1))[0];
  if (!entry) throw new SubstitutionError("ไม่พบการลงทะเบียน", 404);
  if (entry.status !== "active")
    throw new SubstitutionError("การลงทะเบียนนี้ถูกยกเลิกไปแล้ว จึงเปลี่ยนตัวไม่ได้");

  const comp = (
    await db.select().from(competitions).where(eq(competitions.id, entry.competitionId)).limit(1)
  )[0];
  if (!comp) throw new SubstitutionError("ไม่พบรายการแข่งขัน", 404);
  if (comp.yearId !== year.id)
    throw new SubstitutionError("รายการนี้ไม่ได้อยู่ในปีการศึกษาปัจจุบัน");

  // ===== ใคร =====
  const group =
    comp.subjectGroupId == null
      ? null
      : (
          await db
            .select({ catalogNo: subjectGroups.catalogNo })
            .from(subjectGroups)
            .where(eq(subjectGroups.id, comp.subjectGroupId))
            .limit(1)
        )[0] ?? null;
  if (!canSubstitute(actor, comp.createdBy, group?.catalogNo ?? null))
    throw new SubstitutionError("เปลี่ยนตัวได้เฉพาะรายการในหมวดของท่าน", 403);

  // ===== ตอนนี้ถึงเวลาไหม (admin ข้ามได้) =====
  const event = comp.eventId
    ? (await db.select().from(events).where(eq(events.id, comp.eventId)).limit(1))[0] ?? null
    : null;
  const type = comp.type as CompType;
  const gate = substitutionGuard(actor, event, type);
  if (!gate.allowed) throw new SubstitutionError(gate.message, 403);

  // ===== คนใหม่ผ่านกติกาไหม =====
  if (newMember.studentCode === member.studentCode)
    throw new SubstitutionError("คนใหม่กับคนเดิมเป็นคนเดียวกัน");

  const allowed = parseJsonArray(comp.allowedClassLevels);
  if (!allowed.includes(newMember.classLevel))
    throw new SubstitutionError(
      `${newMember.name} (${newMember.classLevel}) ไม่อยู่ในระดับชั้นที่รายการนี้รับ`
    );

  // เพื่อนร่วมทีมที่เหลือ (ไม่รวมที่นั่งที่กำลังเปลี่ยน)
  const teammates = (
    await db.select().from(entryMembers).where(eq(entryMembers.entryId, entry.id))
  ).filter((m) => m.id !== member.id);
  if (teammates.some((m) => m.studentCode === newMember.studentCode))
    throw new SubstitutionError(`${newMember.name} อยู่ในทีมนี้อยู่แล้ว`);

  // ทีมห้ามข้ามห้อง — คนใหม่ต้องอยู่ห้องเดียวกับเพื่อนร่วมทีมที่เหลือ
  // บังคับกับ admin ด้วย เหมือนตอนลงทะเบียน (เป็นกติกาของตัวรายการ ไม่ใช่ข้อจำกัดเชิงเวลา)
  if (type === "team" && !comp.allowCrossClass && teammates.length) {
    const rooms = [
      ...new Set(teammates.map((m) => classText(m.classLevelSnapshot, m.classRoomSnapshot))),
    ];
    const newRoom = classText(newMember.classLevel, newMember.classRoom);
    if (rooms.length > 1 || rooms[0] !== newRoom)
      throw new SubstitutionError(
        `รายการนี้ไม่อนุญาตให้ทีมข้ามห้อง — คนใหม่ต้องอยู่ห้อง ${rooms.join(", ")} (${newMember.name} อยู่ ${newRoom})`
      );
  }

  // รายการที่คนใหม่ลงไว้แล้วในปีนี้ (ใช้ทั้งกันซ้ำ นับจำนวนรายการ และตรวจเวลาชน)
  const compsThisYear = await db.select().from(competitions).where(eq(competitions.yearId, year.id));
  const compById = new Map(compsThisYear.map((c) => [c.id, c]));
  const newActive = compsThisYear.length
    ? await db
        .select({ competitionId: entries.competitionId })
        .from(entryMembers)
        .innerJoin(entries, eq(entryMembers.entryId, entries.id))
        .where(
          and(
            eq(entryMembers.studentCode, newMember.studentCode),
            inArray(
              entries.competitionId,
              compsThisYear.map((c) => c.id)
            ),
            eq(entries.status, "active")
          )
        )
    : [];

  if (newActive.some((r) => r.competitionId === comp.id))
    throw new SubstitutionError(`${newMember.name} ลงรายการนี้ไว้แล้ว`);

  // เวลาแข่งชนกัน — ไม่มีใครข้ามได้ รวมทั้ง admin เพราะชนแล้วคือไปแข่งสองที่พร้อมกันไม่ได้จริง ๆ
  if (comp.eventDate && comp.startTime && comp.endTime) {
    for (const r of newActive) {
      const other = compById.get(r.competitionId);
      if (other && other.eventDate === comp.eventDate && other.startTime && other.endTime) {
        if (timeOverlap(comp.startTime, comp.endTime, other.startTime, other.endTime))
          throw new SubstitutionError(
            `${newMember.name} มีเวลาแข่งชนกับรายการ "${other.name}" จึงเปลี่ยนตัวเป็นคนนี้ไม่ได้`
          );
      }
    }
  }

  // จำนวนรายการต่อคน — เกณฑ์เชิงนโยบายแบบเดียวกับตอนลงทะเบียน จึงยกเว้นให้ admin เหมือนกัน
  if (actor.role !== "admin" && newActive.length >= setting.maxEntriesPerStudent)
    throw new SubstitutionError(
      `${newMember.name} ลงครบ ${setting.maxEntriesPerStudent} รายการแล้ว — หากจำเป็นต้องเปลี่ยนตัวเป็นคนนี้ กรุณาติดต่อผู้ดูแลระบบ`
    );

  // ออกเกียรติบัตรให้คนเดิมไปแล้ว — ใบที่แจกไปแล้วจะกลายเป็นของคนที่ไม่ได้แข่ง
  // ต้องให้ผู้ดูแลระบบเพิกถอนใบก่อน (ทะเบียนเกียรติบัตร) แล้วค่อยเปลี่ยน
  const issued = await db
    .select({ serialNo: certificateIssues.serialNo })
    .from(certificateIssues)
    .where(
      and(
        eq(certificateIssues.competitionId, comp.id),
        eq(certificateIssues.entryId, entry.id),
        eq(certificateIssues.studentCode, member.studentCode),
        isNull(certificateIssues.revokedAt)
      )
    )
    .limit(1);
  if (issued.length && actor.role !== "admin")
    throw new SubstitutionError(
      `ออกเกียรติบัตรเลขที่ ${issued[0].serialNo} ให้ ${member.nameSnapshot} ไปแล้ว — ` +
        "ต้องให้ผู้ดูแลระบบเพิกถอนใบเดิมก่อนจึงจะเปลี่ยนตัวได้"
    );

  // ===== เขียน =====
  const outSnapshot = {
    studentCode: member.studentCode,
    name: member.nameSnapshot,
    class: classText(member.classLevelSnapshot, member.classRoomSnapshot),
  };

  await db.transaction(async (tx) => {
    await tx
      .update(entryMembers)
      .set({
        studentCode: newMember.studentCode,
        nameSnapshot: newMember.name,
        classLevelSnapshot: newMember.classLevel,
        classRoomSnapshot: newMember.classRoom,
        classNumberSnapshot: newMember.classNumber ?? "",
        substituted: true,
        // คนใหม่ยังไม่ได้ถูกตัดสินว่ามาหรือไม่มา — ล้างธง "ไม่มาแข่งขัน" ของคนเดิมทิ้ง
        // รายการที่ไม่มีการแข่งขันกลับด้าน: ค่าเริ่มต้นคือ "ยังไม่ได้เช็คชื่อ = ไม่มาร่วม"
        // ครูต้องไปติ๊ก "เข้าร่วม" ให้คนใหม่ที่หน้าเช็คชื่อ (จะไม่ได้ใบต่อจากคนเดิมโดยอัตโนมัติ)
        absent: comp.noContest,
      })
      .where(eq(entryMembers.id, member.id));

    await tx.insert(entrySubstitutions).values({
      competitionId: comp.id,
      entryId: entry.id,
      memberId: member.id,
      outStudentCode: outSnapshot.studentCode,
      outName: outSnapshot.name,
      outClass: outSnapshot.class,
      inStudentCode: newMember.studentCode,
      inName: newMember.name,
      inClass: classText(newMember.classLevel, newMember.classRoom),
      reason: (args.reason ?? "").trim().slice(0, 255),
      byRole: actor.role,
      byCode: actor.code,
      byName: actor.name,
    });
  });

  return {
    competitionId: comp.id,
    competitionName: comp.name,
    entryId: entry.id,
    out: { studentCode: outSnapshot.studentCode, name: outSnapshot.name },
    in: { studentCode: newMember.studentCode, name: newMember.name },
  };
}
