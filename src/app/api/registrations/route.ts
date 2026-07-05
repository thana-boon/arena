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

/** resolve snapshot จาก Student API (ยกเว้นตัวนักเรียนเองใช้ session ได้) */
async function resolveMembers(codes: string[], selfSnapshot?: MemberInput): Promise<MemberInput[]> {
  const out: MemberInput[] = [];
  for (const code of codes) {
    if (selfSnapshot && code === selfSnapshot.studentCode) {
      out.push(selfSnapshot);
      continue;
    }
    const s = await fetchStudent(code);
    if (!s) throw new RegistrationError(`ไม่พบข้อมูลนักเรียนรหัส ${code}`, 404);
    out.push({
      studentCode: s.student_code,
      name: studentFullName(s),
      classLevel: s.class_level,
      classRoom: s.class_room,
    });
  }
  return out;
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
      const entryId = await registerEntry({
        competitionId: body.competitionId,
        members,
        teamName: body.teamName ?? null,
        byRole: session.role,
        byCode: session.code,
        override,
      });
      if (override) await logAudit(session.code, "override_register", { competitionId: body.competitionId, entryId, memberCodes });
      return ok({ entryId });
    } catch (e) {
      if (e instanceof RegistrationError) return fail(e.message, e.status);
      throw e;
    }
  });
}
