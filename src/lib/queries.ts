import "server-only";
import { db } from "@/db";
import { academicYears, events, settings, teacherRoles, timeSlots, venues } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

export async function getActiveYear() {
  const rows = await db.select().from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
  return rows[0] ?? null;
}

export async function getYearById(yearId: number) {
  const rows = await db.select().from(academicYears).where(eq(academicYears.id, yearId)).limit(1);
  return rows[0] ?? null;
}

export async function getYearSettings(yearId: number) {
  const rows = await db.select().from(settings).where(eq(settings.yearId, yearId)).limit(1);
  return rows[0] ?? null;
}

export async function getActiveYearWithSettings() {
  const year = await getActiveYear();
  if (!year) return { year: null, setting: null };
  const setting = await getYearSettings(year.id);
  return { year, setting };
}

/**
 * ปี + ตั้งค่าของ "ปีที่ระบุ" (ไม่ใช่ปีที่เปิดใช้งาน)
 * ใช้ตอนออกเกียรติบัตรย้อนหลัง: เลขทะเบียน/ปี พ.ศ. บนใบ และเกณฑ์เหรียญ ต้องเป็นของปีที่แข่งจริง
 * ไม่ใช่ปีปัจจุบัน ไม่งั้นงานปี 2567 จะได้เลข "2569/xxxx" และตัดเหรียญด้วยเกณฑ์ผิดปี
 */
export async function getYearWithSettings(yearId: number) {
  const year = await getYearById(yearId);
  if (!year) return { year: null, setting: null };
  const setting = await getYearSettings(year.id);
  return { year, setting };
}

/**
 * "งานเริ่มต้น" ที่ admin เลือกไว้ในหน้าตั้งค่า — ใช้เป็นงานที่หน้าสาธารณะแสดง
 * คืน null ถ้ายังไม่ได้เลือก (หน้าสาธารณะจะถือว่าแสดงทุกงานของปีนั้น)
 */
export async function getDefaultEvent() {
  const { year, setting } = await getActiveYearWithSettings();
  if (!year || setting?.defaultEventId == null) return { year, setting, event: null };
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.id, setting.defaultEventId), eq(events.yearId, year.id)))
    .limit(1);
  return { year, setting, event: rows[0] ?? null };
}

/** ช่วงเวลาแข่งขันของปี เรียงตาม sortOrder → เวลาเริ่ม */
export async function getTimeSlots(yearId: number) {
  return db
    .select()
    .from(timeSlots)
    .where(eq(timeSlots.yearId, yearId))
    .orderBy(asc(timeSlots.sortOrder), asc(timeSlots.startTime));
}

/** สถานที่แข่งขันทั้งหมด (master data global) เรียงตามอาคาร → ชื่อ */
export async function getVenues() {
  return db.select().from(venues).orderBy(asc(venues.building), asc(venues.name));
}

/** อ่านสิทธิ์ครูจากตาราง teacher_roles */
export async function getTeacherRole(teacherCode: string) {
  const rows = await db.select().from(teacherRoles).where(eq(teacherRoles.teacherCode, teacherCode)).limit(1);
  return rows[0] ?? null;
}
