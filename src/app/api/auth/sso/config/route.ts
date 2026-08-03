import { ok } from "@/lib/api";
import { env, SSO_ENABLED } from "@/lib/env";
import { IDLE_SECONDS } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * ===== ค่าตั้งต้นของ SSO สำหรับฝั่งเบราว์เซอร์ (ไม่ต้องล็อกอินก็เรียกได้) =====
 *
 * ทำไมต้องมี endpoint นี้แทนที่จะใช้ NEXT_PUBLIC_* ให้จบ:
 * NEXT_PUBLIC_* ถูก bake ตอน `next build` เหมือน BASE_PATH → ทุกครั้งที่ย้ายโดเมน เปลี่ยน
 * audience หรือแค่อยากปิด SSO ชั่วคราว ต้อง build image ใหม่ทั้งใบบนเครื่องโรงเรียน
 * ซึ่งเป็นขั้นตอนที่เคยทำ prod ล่มมาแล้ว · ค่าพวกนี้ไม่ใช่ความลับ (คนละเรื่องกับ API key
 * ที่ต้องอยู่ฝั่ง server เท่านั้น) จึงให้ server อ่านจาก env แล้วส่งมา — จบที่ .env ไฟล์เดียว
 * แก้แล้ว restart ได้เลย
 */
export function GET() {
  return ok({
    enabled: SSO_ENABLED,
    usersBase: env.SSO_USERS_BASE,
    audience: env.SSO_AUDIENCE,
    portalUrl: env.SSO_PORTAL_URL,
    // หน้าเว็บใช้ค่านี้เป็นความยาวของ "ช่วงพักหลังถูกเตะออก" ที่ห้าม SSO ดึงกลับเข้ามาทันที
    // (ดู lib/auth/clientState.ts) — ต้องมาจาก server เพราะเป็นค่าเดียวกับที่ session ใช้จริง
    idleSeconds: IDLE_SECONDS,
  });
}
