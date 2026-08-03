import { z } from "zod";
import { ok, fail, handle } from "@/lib/api";
import { SSO_ENABLED, env } from "@/lib/env";
import { createSession } from "@/lib/auth/session";
import { sessionForTeacher, sessionForStudent } from "@/lib/auth/mapUser";
import { sosRedeemHandoff, SosHandoffError } from "@/lib/external/schoolos";
import { fetchActiveTeacher, teacherFullName } from "@/lib/external/teacher-api";
import { fetchActiveStudent } from "@/lib/external/student-api";
import { ssoBlockedFor, ssoFailed, ssoSucceeded, clientIp } from "@/lib/rateLimit";
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
    if (!SSO_ENABLED) return fail("ระบบไม่ได้เปิดใช้การเข้าสู่ระบบผ่าน SchoolOS", 404);

    // ⚠ ถังคนละใบกับ /api/auth/login โดยเจตนา (ดู lib/rateLimit.ts)
    const ip = clientIp(req);
    const wait = ssoBlockedFor(ip);
    if (wait != null) {
      return fail(`เชื่อมต่อบัญชี SchoolOS บ่อยเกินไป กรุณารอ ${wait} วินาที`, 429);
    }

    const { code } = schema.parse(await req.json());

    let redeemed;
    try {
      redeemed = await sosRedeemHandoff(code);
    } catch (e) {
      if (e instanceof SosHandoffError) {
        if (e.isReplay) {
          // โค้ดถูกใช้ไปแล้ว = ระบบเรายิงซ้ำเอง เป็นบั๊กฝั่งเรา ไม่ใช่ความผิดผู้ใช้
          // (ฝั่งหน้าเว็บห้าม retry ด้วยโค้ดเดิมเด็ดขาด ต้องขอโค้ดใหม่เสมอ)
          console.error("[sso] โค้ด handoff ถูกใช้ไปแล้ว (used_code) — มีจุดที่ยิงโค้ดเดิมซ้ำ ตรวจ LoginForm");
        }
        if (e.userFixable) {
          ssoFailed(ip);
          // โค้ดหมดอายุ/ใช้ไปแล้ว — เรื่องปกติ (เช่นเปิดหน้าค้างไว้เกิน 60 วิ) ให้ถอยไปกรอกรหัสผ่าน
          return fail("การเชื่อมต่อบัญชี SchoolOS หมดอายุ กรุณาเข้าสู่ระบบด้วยรหัสผ่าน", 401);
        }
        // ปัญหา config ฝั่งเรา ผู้ใช้ทำอะไรไม่ได้ — ต้องอ่านออกจาก log ได้ทันทีโดยไม่ต้องเดา
        console.error(
          `[sso] แลกโค้ด handoff ไม่ได้ (${e.code}) — เช็คว่า API key มี scope auth:handoff` +
            ` และตั้ง audience=${env.SSO_AUDIENCE} แล้วหรือยัง` +
            ` (GET ${env.SSO_API_BASE}/api/public/v1/me ต้องเห็น handoffAudience: "${env.SSO_AUDIENCE}")` +
            ` และ SSO_API_BASE ต้องชี้ Users อินสแตนซ์เดียวกับ SSO_USERS_BASE`
        );
        return fail("ระบบเชื่อมต่อบัญชี SchoolOS ไม่ได้ กรุณาเข้าสู่ระบบด้วยรหัสผ่าน", 503);
      }
      throw e;
    }

    const { user, absoluteEndsAt } = redeemed;

    /**
     * ⚠ ตัวตนที่ได้จาก handoff เชื่อได้แค่ "คนนี้คือใคร" เท่านั้น
     * payload ไม่มี active/status และ role มีแค่ teacher|student (ไม่มี teacher-admin)
     * → ต้องตรวจสิทธิ์เองอีกรอบด้วย API key ของเรา ด้วยเกณฑ์เดียวกับตอนล็อกอินด้วยรหัสผ่าน
     */
    if (user.role === "student") {
      const found = await fetchActiveStudent(user.code);
      if (found.status === "inactive") {
        return fail("บัญชีนี้ไม่ได้มีสถานะกำลังศึกษาแล้ว จึงเข้าใช้งานระบบไม่ได้", 403);
      }
      if (found.status === "not_found") {
        return fail("ไม่พบข้อมูลนักเรียนในระบบ กรุณาติดต่อผู้ดูแลระบบ", 403);
      }
      const payload = sessionForStudent(found.profile);
      await createSession({ ...payload, sso: true }, { absoluteEndsAt });
      ssoSucceeded(ip);
      return ok({ role: payload.role, redirect: ROLE_HOME[payload.role] ?? "/" });
    }

    const found = await fetchActiveTeacher(user.code);
    if (found.status === "inactive") {
      return fail("บัญชีบุคลากรนี้ไม่ได้ปฏิบัติงานแล้ว จึงเข้าใช้งานระบบไม่ได้", 403);
    }
    if (found.status === "not_found") {
      return fail("ไม่พบข้อมูลบุคลากรในระบบ กรุณาติดต่อผู้ดูแลระบบ", 403);
    }
    const payload = await sessionForTeacher(found.profile);
    await createSession({ ...payload, sso: true }, { absoluteEndsAt });
    ssoSucceeded(ip);
    console.info(
      `[sso] เข้าสู่ระบบด้วย SSO: ${teacherFullName(found.profile)} (${found.profile.teacher_code}) → ${payload.role}`
    );
    return ok({ role: payload.role, redirect: ROLE_HOME[payload.role] ?? "/" });
  });
}
