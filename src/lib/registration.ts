import "server-only";
import { db } from "@/db";
import {
  certificateIssues,
  competitions,
  competitionCapacity,
  entries,
  entryMembers,
  entrySubstitutions,
  events,
  scores,
  subjectGroups,
} from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getActiveYearWithSettings } from "@/lib/queries";
import { parseJsonArray, registrationWindow } from "@/lib/domain";
import { canRegisterHiddenCompetition } from "@/lib/permit";
import type { Role } from "@/lib/auth/session";

export class RegistrationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type MemberInput = {
  studentCode: string;
  name: string;
  classLevel: string;
  classRoom: string;
  /** เลขที่ในห้อง — "" ได้ (SchoolOS ไม่ได้ส่งมา) เอกสารจะพิมพ์เป็น "-" */
  classNumber?: string;
};

export type RegisterArgs = {
  competitionId: number;
  members: MemberInput[];
  teamName?: string | null;
  byRole: Role;
  byCode: string;
  /** เลขหมวดของครูผู้กด (session.subjectGroupId) — ใช้ตัดสินสิทธิ์รายการที่ซ่อนจากนักเรียน */
  bySubjectGroupId?: number;
  override?: boolean; // admin override เท่านั้น
};

/** ตรวจ overlap ช่วงเวลา (สมมติเวลาเป็น HH:MM:SS) */
function timeOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export type RegisterResult = {
  entryId: number;
  /** ชื่อรายการ — ผู้เรียกใช้เขียนลง audit log ได้โดยไม่ต้อง query ซ้ำ */
  competitionName: string;
  /** admin ลงนอกช่วงรับสมัคร (ปิดรับ/หมดเวลา/ยังไม่เปิด) — ผู้เรียกใช้ติดธงไว้ใน audit log */
  afterClose: boolean;
};

/**
 * ลงทะเบียน 1 entry แบบ atomic + validate กติกา 1–7
 * ทุกอย่างอยู่ใน transaction เดียว, counter อัปเดตแบบ conditional กัน race
 */
export async function registerEntry(args: RegisterArgs): Promise<RegisterResult> {
  const override = args.override === true && args.byRole === "admin";
  const { year, setting } = await getActiveYearWithSettings();
  if (!year || !setting) throw new RegistrationError("ยังไม่มีปีการศึกษาที่เปิดใช้งาน");

  const comp = (await db.select().from(competitions).where(eq(competitions.id, args.competitionId)).limit(1))[0];
  if (!comp) throw new RegistrationError("ไม่พบรายการแข่งขัน", 404);
  if (comp.yearId !== year.id) throw new RegistrationError("รายการนี้ไม่ได้อยู่ในปีการศึกษาปัจจุบัน");

  // งานที่รายการสังกัด — เป็นเจ้าของช่วงรับสมัคร/การมองเห็น
  const event = comp.eventId
    ? (await db.select().from(events).where(eq(events.id, comp.eventId)).limit(1))[0]
    : null;

  // กติกา 1: เปิดรับสมัคร + อยู่ในช่วงเวลา (ระดับงาน)
  //
  // admin ไม่ติดช่วงเวลา — ลงทะเบียนเพิ่มได้ตลอดแม้ปิดรับ/หมดเวลาไปแล้ว โดยไม่ต้องติ๊ก override
  // เพราะคนที่ต้องตามเก็บเคสตกหล่นหลังปิดรับก็คือ admin อยู่แล้ว และ override เป็นค้อนที่ใหญ่เกินไป
  // (ข้ามจำนวนรายการต่อคน/เวลาแข่งชนไปด้วย) กติกาที่เหลือจึงยังบังคับกับ admin ตามปกติ
  // บันทึกไว้ใน audit ว่าลงหลังปิดรับ (afterClose) — ตามรอยได้ว่ารายชื่อไหนเพิ่มทีหลัง
  let afterClose = false;
  if (!override) {
    if (!event) throw new RegistrationError("รายการนี้ยังไม่ถูกจัดเข้างาน");
    if (args.byRole === "student" && !event.visibleToStudents)
      throw new RegistrationError("งานนี้ยังไม่เปิดให้นักเรียน", 403);
    const window = registrationWindow(event);
    if (!window.open) {
      if (args.byRole !== "admin") throw new RegistrationError(window.reason!);
      afterClose = true;
    }
  }

  // รายการที่ซ่อนจากนักเรียน — คุมซ้อนระดับรายการ (นอกเหนือจากช่วงรับสมัครระดับงาน)
  // ไม่ใช่แค่กันนักเรียนสมัครเอง: ครูประจำชั้นก็หยิบไปสมัครแทนนักเรียนไม่ได้ เพราะรายการแบบนี้
  // ต้องคัดตัวก่อน · เหลือเฉพาะครูที่ดูแลรายการนั้น (เจ้าของ/หมวดเดียวกัน) กับ recorder/admin
  // บังคับกับ override ด้วย (admin ผ่านเงื่อนไขนี้อยู่แล้ว จึงไม่กระทบการ override ของ admin)
  if (!comp.visibleToStudents) {
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
    const actor = { role: args.byRole, code: args.byCode, subjectGroupId: args.bySubjectGroupId };
    if (!canRegisterHiddenCompetition(actor, comp.createdBy, group?.catalogNo ?? null))
      throw new RegistrationError(
        args.byRole === "student"
          ? "รายการนี้ไม่เปิดให้นักเรียนสมัครเอง"
          : "รายการนี้ซ่อนจากนักเรียน — ลงชื่อให้ได้เฉพาะครูเจ้าของรายการ ครูในหมวดเดียวกัน หรือผู้ดูแลระบบ",
        403
      );
  }

  const allowed = parseJsonArray(comp.allowedClassLevels);
  const isTeam = comp.type === "team";

  if (!args.members.length) throw new RegistrationError("ต้องมีผู้เข้าแข่งขันอย่างน้อย 1 คน");
  if (!isTeam && args.members.length !== 1) throw new RegistrationError("รายการเดี่ยวรับผู้เข้าแข่งขัน 1 คน");

  // กติกา 6: ขนาดทีม
  if (isTeam) {
    const min = comp.teamSizeMin ?? 1;
    const max = comp.teamSizeMax ?? args.members.length;
    if (args.members.length < min || args.members.length > max)
      throw new RegistrationError(`ทีมต้องมีสมาชิก ${min}–${max} คน`);
  }

  // ห้ามสมาชิกซ้ำในทีมเดียวกัน
  const codes = args.members.map((m) => m.studentCode);
  if (new Set(codes).size !== codes.length) throw new RegistrationError("มีนักเรียนซ้ำในทีมเดียวกัน");

  // กติกา 2: ระดับชั้นของทุกคนต้องอยู่ใน allowed
  for (const m of args.members) {
    if (!allowed.includes(m.classLevel))
      throw new RegistrationError(`${m.name} (${m.classLevel}) ไม่อยู่ในระดับชั้นที่รายการนี้รับ`);
  }

  // กติกา 2.1: ทีมที่ไม่อนุญาตข้ามห้อง — ทุกคนต้องอยู่ห้องเรียนเดียวกัน (ระดับชั้น+ห้อง)
  // บังคับกับทุก role รวมถึง admin และไม่ยกเว้นให้ override เพราะเป็นกติกาของตัวรายการเอง
  // ไม่ใช่ข้อจำกัดเชิงเวลา/จำนวนแบบกติกา 1,3,4
  if (isTeam && !comp.allowCrossClass) {
    const rooms = [...new Set(args.members.map((m) => `${m.classLevel}/${m.classRoom}`))];
    if (rooms.length > 1)
      throw new RegistrationError(
        `รายการนี้ไม่อนุญาตให้ทีมข้ามห้อง — สมาชิกทุกคนต้องอยู่ห้องเดียวกัน (พบ ${rooms.join(", ")})`
      );
  }

  // ดึง active entries ของสมาชิกเหล่านี้ในปีนี้ (ใช้ตรวจกติกา 3,4 และกันลงซ้ำ)
  const compsThisYear = await db.select().from(competitions).where(eq(competitions.yearId, year.id));
  const compIds = compsThisYear.map((c) => c.id);
  const compById = new Map(compsThisYear.map((c) => [c.id, c]));

  const memberActive = compIds.length
    ? await db
        .select({
          studentCode: entryMembers.studentCode,
          competitionId: entries.competitionId,
          entryId: entries.id,
        })
        .from(entryMembers)
        .innerJoin(entries, eq(entryMembers.entryId, entries.id))
        .where(
          and(
            inArray(entryMembers.studentCode, codes),
            inArray(entries.competitionId, compIds),
            eq(entries.status, "active")
          )
        )
    : [];

  for (const m of args.members) {
    const mine = memberActive.filter((r) => r.studentCode === m.studentCode);

    // กันลงรายการเดียวกันซ้ำ
    if (mine.some((r) => r.competitionId === comp.id))
      throw new RegistrationError(`${m.name} ลงรายการนี้ไปแล้ว`);

    // กติกา 3: จำนวนรายการต่อคน
    if (!override && mine.length >= setting.maxEntriesPerStudent)
      throw new RegistrationError(`${m.name} ลงครบ ${setting.maxEntriesPerStudent} รายการแล้ว`);

    // กติกา 4: เวลาแข่งชนกัน
    if (!override && comp.eventDate && comp.startTime && comp.endTime) {
      for (const r of mine) {
        const other = compById.get(r.competitionId);
        if (other && other.eventDate === comp.eventDate && other.startTime && other.endTime) {
          if (timeOverlap(comp.startTime, comp.endTime, other.startTime, other.endTime))
            throw new RegistrationError(`${m.name} มีเวลาแข่งชนกับรายการ "${other.name}"`);
        }
      }
    }
  }

  // ===== กติกา 5: atomic capacity + insert ใน transaction เดียว =====
  // ทีม หรือ เดี่ยวแบบรวมทุกชั้น → นับกับ pool เดียว (class_level = null)
  const combined = comp.capacityMode === "combined";
  const capLevel = isTeam || combined ? null : args.members[0].classLevel;

  const entryId = await db.transaction(async (tx) => {
    // หา capacity row
    const capRows = await tx
      .select()
      .from(competitionCapacity)
      .where(
        capLevel === null
          ? eq(competitionCapacity.competitionId, comp.id)
          : and(eq(competitionCapacity.competitionId, comp.id), eq(competitionCapacity.classLevel, capLevel))
      )
      .limit(1);
    const cap = capRows[0];
    if (!cap) throw new RegistrationError("ไม่พบข้อมูลที่นั่งของรายการนี้");

    // conditional update กัน race — เพิ่ม counter เฉพาะเมื่อยังไม่เต็ม
    // capacity < 0 = ไม่จำกัดจำนวน → เพิ่มได้เสมอ
    const res = await tx
      .update(competitionCapacity)
      .set({ registeredCount: sql`${competitionCapacity.registeredCount} + 1` })
      .where(
        and(
          eq(competitionCapacity.id, cap.id),
          sql`(${competitionCapacity.capacity} < 0 OR ${competitionCapacity.registeredCount} < ${competitionCapacity.capacity})`
        )
      )
      .returning({ id: competitionCapacity.id });
    // นับแถวที่ถูกอัปเดตจริง — ถ้า 0 แปลว่าเงื่อนไข (ยังไม่เต็ม) ไม่ผ่าน
    if (res.length === 0) throw new RegistrationError("ที่นั่งเต็มแล้ว");

    const [ins] = await tx
      .insert(entries)
      .values({
        competitionId: comp.id,
        teamName: isTeam ? args.teamName?.trim() || null : null,
        status: "active",
        createdByRole: args.byRole,
        createdByCode: args.byCode,
      })
      .returning({ id: entries.id });
    const newEntryId = ins.id;
    await tx.insert(entryMembers).values(
      args.members.map((m) => ({
        entryId: newEntryId,
        studentCode: m.studentCode,
        nameSnapshot: m.name,
        classLevelSnapshot: m.classLevel,
        classRoomSnapshot: m.classRoom,
        classNumberSnapshot: m.classNumber ?? "",
        // รายการที่ "ไม่มีการแข่งขัน" เริ่มที่ "ยังไม่ได้เช็คชื่อ = ถือว่าไม่มาร่วม"
        // ต้องให้ครูติ๊ก "เข้าร่วม" ที่หน้าเช็คชื่อก่อนจึงจะได้เกียรติบัตร
        // (สำคัญกับคนที่มาลงทะเบียนทีหลัง หลังครูเช็คชื่อไปแล้ว — ไม่งั้นได้ใบฟรีโดยไม่มีใครยืนยันว่ามา)
        // รายการแข่งขันปกติยังเหมือนเดิม: มาแข่งทุกคน จนกว่าจะติ๊กว่าไม่มา
        absent: comp.noContest,
      }))
    );
    return newEntryId;
  });

  return { entryId, competitionName: comp.name, afterClose };
}

export type DeletedEntry = {
  competitionId: number;
  /** ใครถูกลบออกไปบ้าง — เก็บลง audit log เพราะหลังลบแล้วไม่เหลือแถวไหนบอกได้อีก */
  members: { studentCode: string; name: string }[];
  /** ใบที่ออกไปแล้วและยังเก็บไว้ (ไม่ถูกลบตาม entry) */
  keptCertificates: number;
};

/**
 * ยกเลิกการลงทะเบียน — ลบทิ้งจริง ไม่ใช่ทำเครื่องหมายว่าถอนแล้ว
 *
 * เดิมเป็น soft delete (entries.status = 'withdrawn') แล้วทุกหน้าจอค่อยกรอง status='active' ทิ้ง
 * ผลคือแถวที่ไม่มีใครได้ใช้ค้างในฐานตลอดกาล แล้วไปโผล่ที่เดียวคือ "ทะเบียนเกียรติบัตร"
 * ซึ่งตั้งใจไม่กรองอะไรเลย — เด็กที่สมัคร→ถอน→สมัครใหม่จึงขึ้นรายการละหลายแถวจนอ่านไม่ออก
 * เลิกเก็บดีกว่า เพราะไม่มีหน้าไหนในระบบใช้ประโยชน์จากแถวที่ถอนแล้วเลยสักหน้าเดียว
 *
 * ⚠ certificate_issues ไม่ถูกลบตามไปด้วยเด็ดขาด — ใบที่ออกไปแล้วอยู่ในมือนักเรียนจริง
 * และเผาเลขทะเบียนของโรงเรียนไปแล้ว ทะเบียนเก็บ snapshot ไว้ครบจึงยังค้นเจอและพิมพ์ซ้ำได้
 * แม้ entry ต้นทางจะหายไป (certRegistry ส่วน "orphans" รับเคสนี้อยู่)
 * การลบใบเป็นคนละคำสั่ง อยู่ที่หน้าออกเกียรติบัตร ซึ่งถอยเลขทะเบียนคืนให้ด้วย
 *
 * ⚠ สคีมานี้ไม่มี FK/ON DELETE CASCADE เลย ลูกทุกตัวจึงต้องลบเองให้ครบใน transaction เดียว
 * ลืมตัวไหนไว้ = แถวกำพร้าที่ไม่มีทางลบได้อีก (entry_id ชี้ไปยัง id ที่ serial จะเวียนมาใช้ซ้ำไม่ได้)
 */
export async function deleteEntry(entryId: number): Promise<DeletedEntry> {
  return db.transaction(async (tx) => {
    const entry = (await tx.select().from(entries).where(eq(entries.id, entryId)).limit(1))[0];
    if (!entry) throw new RegistrationError("ไม่พบการลงทะเบียน", 404);

    const members = await tx.select().from(entryMembers).where(eq(entryMembers.entryId, entryId));
    const comp = (await tx.select().from(competitions).where(eq(competitions.id, entry.competitionId)).limit(1))[0];
    const capLevel =
      comp?.type === "team" || comp?.capacityMode === "combined" ? null : members[0]?.classLevelSnapshot ?? null;
    const certs = await tx
      .select({ id: certificateIssues.id })
      .from(certificateIssues)
      .where(eq(certificateIssues.entryId, entryId));

    await tx.delete(scores).where(eq(scores.entryId, entryId));
    await tx.delete(entrySubstitutions).where(eq(entrySubstitutions.entryId, entryId));
    await tx.delete(entryMembers).where(eq(entryMembers.entryId, entryId));
    await tx.delete(entries).where(eq(entries.id, entryId));

    // ลด counter (ไม่ต่ำกว่า 0) — เฉพาะแถวที่ยัง active อยู่
    // แถวเก่าที่ถูก "ถอน" ไว้สมัยยังเป็น soft delete หักออกจาก counter ไปแล้วรอบหนึ่ง หักซ้ำไม่ได้
    if (entry.status === "active") {
      await tx
        .update(competitionCapacity)
        .set({ registeredCount: sql`GREATEST(${competitionCapacity.registeredCount} - 1, 0)` })
        .where(
          capLevel === null
            ? eq(competitionCapacity.competitionId, entry.competitionId)
            : and(
                eq(competitionCapacity.competitionId, entry.competitionId),
                eq(competitionCapacity.classLevel, capLevel)
              )
        );
    }

    return {
      competitionId: entry.competitionId,
      members: members.map((m) => ({ studentCode: m.studentCode, name: m.nameSnapshot })),
      keptCertificates: certs.length,
    };
  });
}
