import { z } from "zod";
import { db } from "@/db";
import { adminsLocal, teacherRoles } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { ok, fail, handle } from "@/lib/api";
import { createSession, type Role } from "@/lib/auth/session";
import { teacherLogin, teacherFullName } from "@/lib/external/teacher-api";
import { studentVerify, fetchStudent, studentFullName } from "@/lib/external/student-api";
import { getTeacherRole } from "@/lib/queries";

// ฟอร์ม login เดียว: identifier (รหัสผู้ใช้/รหัสนักเรียน) + secret (รหัสผ่าน/เลขบัตรประชาชน)
const schema = z.object({
  identifier: z.string().min(1, "กรุณากรอกรหัสผู้ใช้ / รหัสนักเรียน"),
  secret: z.string().min(1, "กรุณากรอกรหัสผ่าน / เลขบัตรประชาชน"),
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

    // 2) นักเรียน — รหัสผ่านนักเรียน = "Skdw" + เลขบัตรประชาชน 13 หลัก
    //    (ทำก่อน Teacher API เพื่อไม่ให้ต้องเรียก API ครูโดยไม่จำเป็น และเลี่ยงกรณี API ครูล่มมากระทบนักเรียน)
    const studentMatch = /^Skdw(\d{13})$/.exec(secret);
    if (studentMatch) {
      const citizenId = studentMatch[1];
      const matched = await studentVerify(identifier, citizenId);
      if (matched) {
        const student = await fetchStudent(identifier);
        if (student) {
          await createSession({
            role: "student",
            code: student.student_code,
            name: studentFullName(student),
            classLevel: student.class_level,
            classRoom: student.class_room,
          });
          return ok({ role: "student", redirect: "/student" });
        }
      }
      // ไม่ใช่นักเรียน → ตกไปลอง Teacher API ต่อ (เผื่อรหัสผ่านครูบังเอิญขึ้นต้น Skdw + เลข 13 หลัก)
    }

    // 3) ครู — ผ่าน Teacher API
    const profile = await teacherLogin(identifier, secret);
    if (profile) {
      // อ่านสิทธิ์เพิ่มจาก teacher_roles
      const roleRow = await getTeacherRole(profile.teacher_code);
      let role: Role = "teacher";
      if (roleRow?.isAdmin) role = "admin";
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

    return fail("รหัสผู้ใช้ / รหัสผ่านไม่ถูกต้อง", 401);
  });
}
