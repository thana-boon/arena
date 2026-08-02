import { getSession, touchSession, sessionExpiresIn } from "@/lib/auth/session";
import { ok, fail, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET — เหลืออีกกี่วินาที session ถึงหมดอายุ (ไม่ต่ออายุ) ใช้ตอนเปิดหน้าเพื่อตั้งนาฬิกาฝั่งเบราว์เซอร์ */
export async function GET() {
  return handle(async () => {
    const s = await getSession();
    if (!s) return fail("session หมดอายุ", 401);
    return ok({ expiresIn: sessionExpiresIn(s) });
  });
}

/**
 * POST — ต่ออายุ session ของผู้ใช้ที่ยังใช้งานอยู่
 * หน้าเว็บเรียกเมื่อผู้ใช้ขยับจริงเท่านั้น (ดู SessionTimeout.tsx) ไม่ยิงตามเวลาอัตโนมัติ
 * ไม่งั้นแท็บที่เปิดค้างไว้จะต่ออายุตัวเองไปเรื่อย ๆ = เท่ากับไม่มี timeout
 */
export async function POST() {
  return handle(async () => {
    const s = await getSession();
    if (!s) return fail("session หมดอายุ", 401);
    const expiresIn = await touchSession(s);
    if (expiresIn <= 0) return fail("หมดเวลาใช้งานสูงสุด กรุณาเข้าสู่ระบบใหม่", 401);
    return ok({ expiresIn });
  });
}
