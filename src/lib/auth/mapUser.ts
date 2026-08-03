import "server-only";
import { db } from "@/db";
import { teacherRoles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTeacherRole } from "@/lib/queries";
import { teacherFullName, type TeacherProfile } from "@/lib/external/teacher-api";
import { studentFullName, type StudentProfile } from "@/lib/external/student-api";
import type { Role, SessionPayload } from "./session";

/**
 * ===== แปลงผู้ใช้ของ SchoolOS เป็น session ของ arena — จุดเดียวในระบบ =====
 *
 * ใช้ร่วมกันทั้งทางล็อกอินด้วยรหัสผ่าน (/api/auth/login) และทาง SSO handoff (/api/auth/sso)
 * เพื่อให้สองทางให้สิทธิ์ตรงกันเสมอ ไม่ใช่ต่างคนต่าง map แล้วเพี้ยนกันทีหลัง
 *
 * ⚠ สิทธิ์ในระบบ arena ตัดสินจาก "ตารางของเราเอง + role ของ SchoolOS" เท่านั้น
 * ห้ามใช้ permissions (users:read / users:write) ที่ติดมากับ session ของ Users เป็นเกณฑ์เด็ดขาด
 * — นั่นเป็นสิทธิ์ของโมดูล Users ไม่ได้แปลว่าเป็นผู้ดูแลของระบบแข่งขัน
 */

/** ครู → session (role: admin เมื่อ SchoolOS ตั้งเป็น teacher-admin หรือได้รับสิทธิ์จากหน้า /admin/teachers) */
export async function sessionForTeacher(profile: TeacherProfile): Promise<SessionPayload> {
  const roleRow = await getTeacherRole(profile.teacher_code);
  let role: Role = "teacher";
  if (profile.role === "teacher-admin" || roleRow?.isAdmin) role = "admin";
  else if (roleRow?.isRecorder) role = "recorder";

  // อัปเดต snapshot ชื่อไว้ใน teacher_roles ถ้ามี row
  if (roleRow) {
    await db
      .update(teacherRoles)
      .set({ nameSnapshot: teacherFullName(profile) })
      .where(eq(teacherRoles.teacherCode, profile.teacher_code));
  }

  const sg = Number(profile.subject_group);
  return {
    role,
    code: profile.teacher_code,
    name: teacherFullName(profile),
    firstName: profile.first_name,
    photo: profile.photo_url ?? undefined,
    subjectGroupId: Number.isFinite(sg) ? sg : undefined,
  };
}

export function sessionForStudent(student: StudentProfile): SessionPayload {
  return {
    role: "student",
    code: student.student_code,
    name: studentFullName(student),
    firstName: student.first_name,
    photo: student.photo_url ?? undefined,
    classLevel: student.class_level,
    classRoom: student.class_room,
  };
}
