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

// ===== เด้งไปหน้าแรก SchoolOS ไปแล้วเมื่อกี้ =====

const BOUNCE_KEY = "arena.sso.bouncedAt";
/** ห้ามเด้งซ้ำภายในกี่มิลลิวินาที */
const BOUNCE_COOLDOWN_MS = 60_000;

/**
 * ⚠ กันลูป arena ↔ SchoolOS ซึ่งเป็นความเสี่ยงเดียวของนโยบาย "ไม่มี session = เด้งไป portal"
 *
 * เคสจริงที่ทำให้วน: ผู้ใช้ล็อกอิน SchoolOS อยู่ก็จริง แต่ handoff ขอโค้ดไม่ผ่าน (origin ไม่อยู่ใน
 * SSO_ALLOWED_ORIGINS / ขอถี่เกินโควตา 10 ครั้งต่อนาที) → เราเด้งไป portal → portal เห็นว่ายัง
 * ล็อกอินอยู่จึงส่งกลับมาที่ arena ทันที → เด้งอีก ไม่จบ และผู้ใช้ทำอะไรไม่ได้เลยสักคลิก
 *
 * เด้งได้ครั้งเดียวต่อหนึ่งช่วง cooldown · ครั้งถัดไปต้องหยุดให้ผู้ใช้เห็นหน้าจอที่มีปุ่มกดเอง
 *
 * sessionStorage ไม่ใช่ localStorage: ผูกกับแท็บนี้เท่านั้น (ออกไป portal แล้วกลับมาแท็บเดิม
 * ค่ายังอยู่ เพราะเป็น origin เดิม) และไม่ข้ามไปกวนแท็บอื่นที่ผู้ใช้กำลังทำงานค้างไว้
 */
export function markPortalBounce(): void {
  try {
    window.sessionStorage.setItem(BOUNCE_KEY, String(Date.now()));
  } catch {
    /* เขียนไม่ได้ = อย่างมากคือกันลูปไม่ได้ ไม่ใช่เหตุให้หน้าเว็บพัง */
  }
}

/** ล้างธง — เรียกเมื่อเข้าระบบสำเร็จ ไม่งั้นออกแล้วเข้าใหม่ภายในนาทีเดียวจะไม่ได้เด้งอัตโนมัติ */
export function clearPortalBounce(): void {
  try {
    window.sessionStorage.removeItem(BOUNCE_KEY);
  } catch {
    /* ลบไม่ได้ก็ปล่อย */
  }
}

export function bouncedRecently(): boolean {
  try {
    const at = Number(window.sessionStorage.getItem(BOUNCE_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < BOUNCE_COOLDOWN_MS;
  } catch {
    return false;
  }
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
