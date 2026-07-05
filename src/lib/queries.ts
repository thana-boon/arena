import "server-only";
import { db } from "@/db";
import { academicYears, settings, teacherRoles } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getActiveYear() {
  const rows = await db.select().from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
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

/** อ่านสิทธิ์ครูจากตาราง teacher_roles */
export async function getTeacherRole(teacherCode: string) {
  const rows = await db.select().from(teacherRoles).where(eq(teacherRoles.teacherCode, teacherCode)).limit(1);
  return rows[0] ?? null;
}
