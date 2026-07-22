import { z } from "zod";
import { db } from "@/db";
import { adminsLocal, teacherRoles } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { ok, fail, handle } from "@/lib/api";
import { createSession, type Role } from "@/lib/auth/session";
import { teacherLogin, teacherFullName } from "@/lib/external/teacher-api";
import { studentLogin, studentFullName, type StudentProfile } from "@/lib/external/student-api";
import { SosRateLimitError, SosKeyError } from "@/lib/external/schoolos";
import { getTeacherRole } from "@/lib/queries";

// ฟอร์ม login เดียว: identifier (รหัสผู้ใช้/รหัสนักเรียน/รหัสครู) + secret (รหัสผ่าน)
const schema = z.object({
  identifier: z.string().min(1, "กรุณากรอกรหัสผู้ใช้ / รหัสนักเรียน"),
  secret: z.string().min(1, "กรุณากรอกรหัสผ่าน"),
});

export async function POST(req: Request) {
  return handle(async () => {
    const { identifier, secret } = schema.parse(await req.json());

    // 1) admin local — ตรวจ username + รหัสผ่านใน DB ก่อน
    const localRows = await db
      .select()
      .from(adminsLocal)
      .where(eq(adminsLocal.username, identifier))
      .limit(1);
    if (localRows.length && (await bcrypt.compare(secret, localRows[0].passwordHash))) {
      await createSession({ role: "admin", code: localRows[0].username, name: "ผู้ดูแลระบบ" });
      return ok({ role: "admin", redirect: "/admin" });
    }

    // 2) นักเรียน / ครู — ตรวจรหัสผ่านผ่าน SchoolOS (/auth/verify)
    //    เดา role จากรูปแบบรหัส: รหัสนักเรียนเป็นตัวเลขล้วน, รหัสครูมีตัวอักษรนำ (เช่น T00116)
    //    ถ้าเดาแล้วไม่ผ่าน ค่อยลองอีก role หนึ่งเป็น fallback
    const numeric = /^\d+$/.test(identifier.trim());

    const loginStudent = async (): Promise<boolean> => {
      const student: StudentProfile | null = await studentLogin(identifier, secret);
      if (!student) return false;
      await createSession({
        role: "student",
        code: student.student_code,
        name: studentFullName(student),
        classLevel: student.class_level,
        classRoom: student.class_room,
      });
      return true;
    };

    try {
      if (numeric && (await loginStudent())) {
        return ok({ role: "student", redirect: "/student" });
      }

      // 3) ครู — ผ่าน SchoolOS
      const profile = await teacherLogin(identifier, secret);
      if (profile) {
      // สิทธิ์ admin มาจาก role ของ SchoolOS โดยตรง: role === "teacher-admin" = admin ของระบบนี้
      // teacher_roles ยังใช้เป็นตัวเสริม (มอบ admin/recorder แบบมือผ่านหน้า /admin/teachers)
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
      await createSession({
        role,
        code: profile.teacher_code,
        name: teacherFullName(profile),
        subjectGroupId: Number.isFinite(sg) ? sg : undefined,
      });
      return ok({ role, redirect: role === "admin" ? "/admin" : "/teacher" });
      }

      // 4) fallback — ถ้ารหัสไม่ใช่ตัวเลข (เดาว่าครู) แต่ที่จริงเป็นนักเรียน
      if (!numeric && (await loginStudent())) {
        return ok({ role: "student", redirect: "/student" });
      }
    } catch (e) {
      if (e instanceof SosRateLimitError) {
        return fail("พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่", 429);
      }
      if (e instanceof SosKeyError) {
        // ปัญหา config ฝั่งเรา ไม่ใช่ผู้ใช้กรอกผิด — ต้องอ่านออกจาก log ได้ทันที
        console.error(`[login] SCHOOLOS_API_KEY ใช้ไม่ได้ (${e.code}) — เช็ค .env บนเครื่องที่ deploy`);
        return fail("ระบบเชื่อมต่อฐานข้อมูลบุคลากรไม่ได้ กรุณาแจ้งผู้ดูแลระบบ", 503);
      }
      throw e;
    }

    return fail("รหัสผู้ใช้ / รหัสผ่านไม่ถูกต้อง", 401);
  });
}
