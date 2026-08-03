"use client";

/**
 * ===== สถานะ auth ฝั่งเบราว์เซอร์ที่ต้องข้ามการโหลดหน้า =====
 *
 * มีของอยู่สองชิ้น ทั้งคู่แก้กับดักที่เจอมาแล้วจริง ไม่ใช่ของประดับ
 */

const KICKED_KEY = "arena.sso.kickedAt";

/** อ่าน/เขียน localStorage แบบไม่พัง (โหมดส่วนตัวบางเบราว์เซอร์โยน error ตอนเขียน) */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* เขียนไม่ได้ = อย่างมากคือ SSO ดึงกลับเข้ามาเร็วไปหน่อย ไม่ใช่เหตุให้หน้าเว็บพัง */
  }
}

/**
 * บันทึกว่า "เพิ่งถูกเตะออก" — เรียกทุกครั้งที่ session จบเองโดยผู้ใช้ไม่ได้กด (idle / หมดเพดาน / SSO ดับ)
 *
 * ⚠ ต้องเก็บ "เวลา" ไม่ใช่ธงเปล่า
 * เราไม่อยากให้ SSO ดึงกลับเข้ามาทันทีหลังโดนเตะเพราะ idle (ไม่งั้น idle timeout ไร้ความหมาย
 * และผู้ใช้ไม่ทันเห็นว่าโดนเตะเพราะอะไร) แต่ถ้าเก็บเป็นธงเปล่าที่ล้างตอนล็อกอินสำเร็จเท่านั้น
 * เบราว์เซอร์ที่เคยหมดเวลาสักครั้งจะไม่ได้ SSO อีกเลยข้ามวันจนกว่าจะกรอกรหัสด้วยมือ
 * — อาการที่ผู้ใช้เห็นคือ "บางเครื่องเข้าเอง บางเครื่องไม่เข้า" ซึ่งหาสาเหตุยากมาก
 */
export function markKickedOut(): void {
  write(KICKED_KEY, String(Date.now()));
}

/** ล้างธง — เรียกเมื่อล็อกอินสำเร็จ (ทางไหนก็ได้) */
export function clearKickedOut(): void {
  write(KICKED_KEY, null);
}

/**
 * เพิ่งถูกเตะออกภายในช่วง idle ที่ผ่านมาไหม → ถ้าใช่ ห้ามทำ silent SSO รอบนี้
 * @param idleSeconds ความยาวหน้าต่าง idle จริงของระบบ (มาจาก /api/auth/sso/config)
 */
export function kickedRecently(idleSeconds: number): boolean {
  const raw = read(KICKED_KEY);
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at)) return false;
  const age = Date.now() - at;
  if (age > idleSeconds * 1000) {
    write(KICKED_KEY, null); // พ้นช่วงแล้ว เก็บกวาดทิ้งเลยจะได้ไม่ค้างข้ามวัน
    return false;
  }
  return age >= 0;
}

// ===== ผู้ใช้กดออกจากระบบเอง =====
let signingOut = false;

/**
 * เรียกก่อนยิง logout ทุกครั้ง
 *
 * ⚠ แก้กับดัก "401 ที่ตามมาทีหลัง": request ที่ค้างอยู่ในท่อจะตอบ 401 กลับมาหลังล้าง session
 * ไปแล้ว ถ้าตัวนับเวลาตีความว่า "เซสชันหมดอายุ" ทันที จะได้หน้า login ที่ขึ้นข้อความผิดบริบท
 * ทั้งที่ผู้ใช้กดออกเอง แถม SSO ยังโดนบล็อกต่อไปอีกช่วงหนึ่งโดยไม่มีเหตุผล
 */
export function beginSignOut(): void {
  signingOut = true;
}

export function isSigningOut(): boolean {
  return signingOut;
}
