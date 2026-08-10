import { z } from "zod";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { substituteMember, SubstitutionError } from "@/lib/substitution";
import { fetchStudent, studentFullName } from "@/lib/external/student-api";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  /** entry_members.id ของที่นั่งที่จะเปลี่ยนคน */
  memberId: z.number().int().positive(),
  newStudentCode: z.string().min(1, "กรุณาเลือกผู้เข้าแข่งขันคนใหม่"),
  reason: z.string().max(255, "เหตุผลยาวเกินไป (ไม่เกิน 255 ตัวอักษร)").optional(),
});

/**
 * เปลี่ยนตัวผู้เข้าแข่งขัน 1 ที่นั่ง
 * นักเรียนเข้าไม่ถึงเลย (ไม่อยู่ใน role ที่รับ) — กติกาที่เหลืออยู่ใน substituteMember ทั้งหมด
 */
export async function POST(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("teacher", "recorder", "admin");
    const body = schema.parse(await req.json());

    try {
      // resolve คนใหม่จาก Student API เหมือนตอนลงทะเบียน — ชื่อ/ชั้น/ห้อง/เลขที่ต้องเป็น snapshot สด
      const code = body.newStudentCode.trim();
      const student = await fetchStudent(code).catch(() => {
        throw new SubstitutionError(`ดึงข้อมูลนักเรียนรหัส ${code} ไม่สำเร็จ กรุณาลองใหม่`, 502);
      });
      if (!student) throw new SubstitutionError(`ไม่พบข้อมูลนักเรียนรหัส ${code}`, 404);

      const result = await substituteMember({
        memberId: body.memberId,
        newMember: {
          studentCode: student.student_code,
          name: studentFullName(student),
          classLevel: student.class_level,
          classRoom: student.class_room,
          classNumber: student.class_number,
        },
        reason: body.reason,
        actor: s,
      });

      await logAudit(s.code, "substitute_member", {
        competitionId: result.competitionId,
        competition: result.competitionName,
        entryId: result.entryId,
        // เก็บชื่อคู่รหัสทั้งสองฝั่ง — ค้นด้วยชื่อคนออกหรือคนเข้าก็เจอเหมือนกัน
        outMember: `${result.out.name} (${result.out.studentCode})`,
        inMember: `${result.in.name} (${result.in.studentCode})`,
        ...(body.reason?.trim() ? { reason: body.reason.trim() } : {}),
      });
      return ok(result);
    } catch (e) {
      if (e instanceof SubstitutionError) return fail(e.message, e.status);
      throw e;
    }
  });
}
