import { z } from "zod";
import { ok, fail, handle } from "@/lib/api";
import { getSession } from "@/lib/auth/session";
import { ApiAuthError } from "@/lib/auth/guards";
import { registerEntry, RegistrationError, type MemberInput } from "@/lib/registration";
import { fetchStudent, studentFullName } from "@/lib/external/student-api";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  competitionId: z.number().int().positive(),
  memberCodes: z.array(z.string().min(1)).min(1, "ต้องมีผู้เข้าแข่งขันอย่างน้อย 1 คน"),
  teamName: z.string().optional().nullable(),
  override: z.boolean().optional(),
});

/**
 * resolve snapshot จาก Student API (ยกเว้นตัวนักเรียนเองใช้ session ได้)
 * ยิงขนานทุกคน — ทีม 6 คนแบบยิงทีละคนคือรอ SchoolOS 6 รอบต่อกัน (ช้าสุดถึงเกือบนาที)
 */
async function resolveMembers(codes: string[], selfSnapshot?: MemberInput): Promise<MemberInput[]> {
  return Promise.all(
    codes.map(async (code) => {
      if (selfSnapshot && code === selfSnapshot.studentCode) return selfSnapshot;
      const s = await fetchStudent(code).catch(() => {
        throw new RegistrationError(`ดึงข้อมูลนักเรียนรหัส ${code} ไม่สำเร็จ กรุณาลองใหม่`, 502);
      });
      if (!s) throw new RegistrationError(`ไม่พบข้อมูลนักเรียนรหัส ${code}`, 404);
      return {
        studentCode: s.student_code,
        name: studentFullName(s),
        classLevel: s.class_level,
        classRoom: s.class_room,
      };
    })
  );
}

export async function POST(req: Request) {
  return handle(async () => {
    const session = await getSession();
    if (!session) throw new ApiAuthError("กรุณาเข้าสู่ระบบ", 401);

    const body = schema.parse(await req.json());
    const isStaff = session.role !== "student";
    const override = !!body.override && session.role === "admin";

    let memberCodes = body.memberCodes.map((c) => c.trim());
    let selfSnapshot: MemberInput | undefined;

    if (session.role === "student") {
      selfSnapshot = {
        studentCode: session.code,
        name: session.name,
        classLevel: session.classLevel ?? "",
        classRoom: session.classRoom ?? "",
      };
      // นักเรียนต้องอยู่ในรายชื่อที่ลงทะเบียนเสมอ
      if (!memberCodes.includes(session.code)) memberCodes = [session.code, ...memberCodes];
    }

    try {
      const members = await resolveMembers(memberCodes, selfSnapshot);
      const { entryId, competitionName } = await registerEntry({
        competitionId: body.competitionId,
        members,
        teamName: body.teamName ?? null,
        byRole: session.role,
        byCode: session.code,
        override,
      });

      // บันทึกการลงทะเบียน "ทุกครั้ง" ไม่ใช่เฉพาะ override
      // (ของเดิมบันทึกแค่ override ทำให้ log ไม่มีร่องรอยเลยว่านักเรียนคนไหนลงรายการอะไร
      //  ทั้งที่ยกเลิก (withdraw_entry) ถูกบันทึกไว้ — เห็นแต่ตอนถอน ไม่เห็นตอนลง)
      // แยก action ตามคนกด เพื่อกรองได้ว่า "นักเรียนลงเอง" กับ "ครูลงให้" ต่างกัน
      const action = override ? "override_register" : isStaff ? "register_by_staff" : "register";
      await logAudit(session.code, action, {
        competitionId: body.competitionId,
        competition: competitionName,
        entryId,
        // เก็บชื่อคู่รหัส — ค้นใน log ด้วยชื่อนักเรียนหรือรหัสก็เจอเหมือนกัน
        members: members.map((m) => `${m.name} (${m.studentCode})`),
        ...(body.teamName?.trim() ? { teamName: body.teamName.trim() } : {}),
      });
      return ok({ entryId });
    } catch (e) {
      if (e instanceof RegistrationError) return fail(e.message, e.status);
      throw e;
    }
  });
}
