import { z } from "zod";
import { ok, fail, handle } from "@/lib/api";
import { createSession } from "@/lib/auth/session";
import { sessionForTeacher, sessionForStudent } from "@/lib/auth/mapUser";
import { sosRedeemHandoff, SosHandoffError } from "@/lib/external/schoolos";
import { fetchTeacher, teacherFullName } from "@/lib/external/teacher-api";
import { fetchStudent } from "@/lib/external/student-api";
import { ROLE_HOME } from "@/lib/domain";

const schema = z.object({ code: z.string().min(1) });

/**
 * ===== เข้าสู่ระบบด้วย SSO ของแพลตฟอร์ม (ไม่ต้องกรอกรหัสผ่านซ้ำ) =====
 *
 * รับ "โค้ดใช้ครั้งเดียว" ที่เบราว์เซอร์ขอมาจาก Users (ดู lib/sso.ts → ssoHandoffCode)
 * แล้ว server เอาไปแลกตัวตนด้วย X-API-Key ของเรา
 *
 * ⚠ ห้ามเปลี่ยนให้รับรหัสผู้ใช้จาก body ตรง ๆ เด็ดขาด: เบราว์เซอร์เป็นฝั่งที่เชื่อไม่ได้
 * ถ้าเชื่อ ใครก็ตามที่รู้รหัสครู (ซึ่งพิมพ์อยู่บนเอกสารทั่วโรงเรียน) จะยิง endpoint นี้
 * เข้าเป็น admin ได้ทันทีโดยไม่ต้องมีรหัสผ่าน — โค้ดคือสิ่งเดียวที่พิสูจน์ตัวตนได้ที่นี่
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { code } = schema.parse(await req.json());

    let redeemed;
    try {
      redeemed = await sosRedeemHandoff(code);
    } catch (e) {
      if (e instanceof SosHandoffError) {
        if (e.userFixable) {
          // โค้ดหมดอายุ/ถูกใช้ไปแล้ว — เรื่องปกติ (เช่นเปิดหน้าค้างไว้เกิน 60 วิ) ให้กรอกรหัสผ่านแทน
          return fail("การเชื่อมต่อบัญชี SchoolOS หมดอายุ กรุณาเข้าสู่ระบบด้วยรหัสผ่าน", 401);
        }
        // ปัญหา config ฝั่งเรา ผู้ใช้ทำอะไรไม่ได้ — ต้องอ่านออกจาก log ได้ทันที
        console.error(
          `[sso] แลกโค้ด handoff ไม่ได้ (${e.code}) — เช็คว่า API key มี scope auth:handoff` +
            ` และตั้ง audience=arena แล้วหรือยัง (GET /api/public/v1/me ต้องเห็น handoffAudience: "arena")` +
            ` และ SSO_API_BASE ต้องชี้ Users อินสแตนซ์เดียวกับ NEXT_PUBLIC_SSO_BASE_URL`
        );
        return fail("ระบบเชื่อมต่อบัญชี SchoolOS ไม่ได้ กรุณาเข้าสู่ระบบด้วยรหัสผ่าน", 503);
      }
      throw e;
    }

    const { user, absoluteEndsAt } = redeemed;

    // role ใน session ของ Users มีแค่ teacher | student — สิทธิ์ระดับ admin ต้องไปอ่าน role จริง
    // จาก /teachers (scope teachers:read ที่เรามีอยู่แล้ว) ไม่ใช่จาก permissions ที่ติดมากับ session
    if (user.role === "student") {
      const student = await fetchStudent(user.code);
      if (!student) return fail("ไม่พบข้อมูลนักเรียนในระบบ กรุณาติดต่อผู้ดูแลระบบ", 403);
      const payload = sessionForStudent(student);
      await createSession({ ...payload, sso: true }, { absoluteEndsAt });
      return ok({ role: payload.role, redirect: ROLE_HOME[payload.role] ?? "/" });
    }

    const teacher = await fetchTeacher(user.code);
    if (!teacher) return fail("ไม่พบข้อมูลบุคลากรในระบบ กรุณาติดต่อผู้ดูแลระบบ", 403);
    const payload = await sessionForTeacher(teacher);
    await createSession({ ...payload, sso: true }, { absoluteEndsAt });
    console.info(`[sso] เข้าสู่ระบบด้วย SSO: ${teacherFullName(teacher)} (${teacher.teacher_code}) → ${payload.role}`);
    return ok({ role: payload.role, redirect: ROLE_HOME[payload.role] ?? "/" });
  });
}
