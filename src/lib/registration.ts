import "server-only";
import { db } from "@/db";
import { competitions, competitionCapacity, entries, entryMembers } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getActiveYearWithSettings } from "@/lib/queries";
import { parseJsonArray } from "@/lib/domain";
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
};

export type RegisterArgs = {
  competitionId: number;
  members: MemberInput[];
  teamName?: string | null;
  byRole: Role;
  byCode: string;
  override?: boolean; // admin override เท่านั้น
};

/** ตรวจ overlap ช่วงเวลา (สมมติเวลาเป็น HH:MM:SS) */
function timeOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * ลงทะเบียน 1 entry แบบ atomic + validate กติกา 1–7
 * ทุกอย่างอยู่ใน transaction เดียว, counter อัปเดตแบบ conditional กัน race
 */
export async function registerEntry(args: RegisterArgs): Promise<number> {
  const override = args.override === true && args.byRole === "admin";
  const { year, setting } = await getActiveYearWithSettings();
  if (!year || !setting) throw new RegistrationError("ยังไม่มีปีการศึกษาที่เปิดใช้งาน");

  // กติกา 1: เปิดรับสมัคร + อยู่ในช่วงเวลา
  if (!override) {
    if (!setting.registrationOpen) throw new RegistrationError("ขณะนี้ปิดรับสมัคร");
    const now = new Date();
    if (setting.regStart && now < new Date(setting.regStart)) throw new RegistrationError("ยังไม่ถึงเวลาเปิดรับสมัคร");
    if (setting.regEnd && now > new Date(setting.regEnd)) throw new RegistrationError("หมดเวลารับสมัครแล้ว");
  }

  const comp = (await db.select().from(competitions).where(eq(competitions.id, args.competitionId)).limit(1))[0];
  if (!comp) throw new RegistrationError("ไม่พบรายการแข่งขัน", 404);
  if (comp.yearId !== year.id) throw new RegistrationError("รายการนี้ไม่ได้อยู่ในปีการศึกษาปัจจุบัน");

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
    const res = await tx
      .update(competitionCapacity)
      .set({ registeredCount: sql`${competitionCapacity.registeredCount} + 1` })
      .where(
        and(
          eq(competitionCapacity.id, cap.id),
          sql`${competitionCapacity.registeredCount} < ${competitionCapacity.capacity}`
        )
      );
    // mysql2: affectedRows
    const affected = (res as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 0;
    if (affected === 0) throw new RegistrationError("ที่นั่งเต็มแล้ว");

    const [ins] = await tx.insert(entries).values({
      competitionId: comp.id,
      teamName: isTeam ? args.teamName?.trim() || null : null,
      status: "active",
      createdByRole: args.byRole,
      createdByCode: args.byCode,
    });
    const newEntryId = ins.insertId;
    await tx.insert(entryMembers).values(
      args.members.map((m) => ({
        entryId: newEntryId,
        studentCode: m.studentCode,
        nameSnapshot: m.name,
        classLevelSnapshot: m.classLevel,
        classRoomSnapshot: m.classRoom,
      }))
    );
    return newEntryId;
  });

  return entryId;
}

/** ยกเลิกการลงทะเบียน (คืน counter ใน transaction เดียว) */
export async function withdrawEntry(entryId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const entry = (await tx.select().from(entries).where(eq(entries.id, entryId)).limit(1))[0];
    if (!entry) throw new RegistrationError("ไม่พบการลงทะเบียน", 404);
    if (entry.status === "withdrawn") return;

    const members = await tx.select().from(entryMembers).where(eq(entryMembers.entryId, entryId));
    const comp = (await tx.select().from(competitions).where(eq(competitions.id, entry.competitionId)).limit(1))[0];
    const capLevel =
      comp?.type === "team" || comp?.capacityMode === "combined" ? null : members[0]?.classLevelSnapshot ?? null;

    await tx.update(entries).set({ status: "withdrawn" }).where(eq(entries.id, entryId));

    // ลด counter (ไม่ต่ำกว่า 0)
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
  });
}
