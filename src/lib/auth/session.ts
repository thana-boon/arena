import "server-only";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { signIdentity, verifyIdentity, type Role, type SessionPayload } from "./identity";

// นิยามตัวตน + การเซ็น/ตรวจ token อยู่ที่ identity.ts (ไฟล์บริสุทธิ์ที่เทสได้) — ไฟล์นี้ดูแลคุกกี้กับอายุ
export type { Role, SessionPayload };
export { identityOf } from "./identity";

const COOKIE = "arena_session";
const secret = () => new TextEncoder().encode(env.JWT_SECRET);

/**
 * อายุ session แบ่งเป็นสองชั้น
 * - IDLE: ไม่มีการใช้งานเกินเท่านี้ → หลุดเอง (ค่า exp ของ JWT + maxAge ของ cookie)
 *   ทุกครั้งที่ยังใช้งานอยู่ ฝั่งหน้าเว็บจะ ping มาต่ออายุให้ (ดู SessionTimeout.tsx)
 * - ABSOLUTE: นับจากตอน login ครั้งแรก ต่ออายุได้ไม่เกินเท่านี้ ต้อง login ใหม่เสมอ
 * ปรับได้ผ่าน env — ค่าเริ่มต้น 15 นาที / 8 ชม.
 *
 * ⚠ ตัวเลขสองตัวนี้ผูกกับนโยบายของ SchoolOS โดยตรง ห้ามตั้งยาวกว่าฝั่งนั้น
 * - IDLE ต้อง <= SESSION_IDLE_MINUTES ของ Users ไม่งั้นจะเกิดช่วงที่ "ยังอยู่ในระบบเรา
 *   แต่ SchoolOS ตายไปแล้ว" = บริการอื่นเด้งให้ล็อกอินแต่ arena ไม่เด้ง อธิบายให้ครูเข้าใจยากมาก
 * - ABSOLUTE ตั้งให้ตรงกับเพดานสัมบูรณ์ของ SSO ด้วยเหตุผลเดียวกัน
 */
export const IDLE_SECONDS = minutesFromEnv("SESSION_IDLE_MINUTES", 15);
export const ABSOLUTE_SECONDS = minutesFromEnv("SESSION_ABSOLUTE_MINUTES", 60 * 8);

/**
 * หน้าต่าง idle ของแอปที่ติดตั้ง ฝั่ง Users (SESSION_PWA_IDLE_DAYS)
 *
 * เพดานเดียวกับ IDLE_SECONDS และด้วยเหตุผลเดียวกัน — ของเราต้องไม่อยู่ยาวกว่าของ SchoolOS —
 * แต่สำหรับ client อีกชนิด · clamp มีไว้กันทางนั้นทางเดียว การตั้งเพดานที่นี่ให้ "สั้นกว่า"
 * ของแพลตฟอร์มเป็นบั๊กของตัวเอง: มือถือหลุดทั้งที่ SchoolOS ยังล็อกอินอยู่ แล้วไม่มีใคร
 * ฝั่งไหนอธิบายได้ว่าทำไม
 */
export const PLATFORM_PWA_IDLE_DAYS = 30;

/**
 * หน้าต่าง idle ของ session ใบนี้ — คนละคำตอบสำหรับ client คนละชนิด
 *
 * แท็บบนเครื่องส่วนกลางได้ 15 นาที เพราะเครื่องแชร์กันและหน้าจอมีข้อมูลของทั้งงาน
 * แอปที่ติดตั้งบนมือถือของเจ้าตัวได้เป็นสัปดาห์ เพราะมันถูกปิดแล้วเปิดใหม่ทั้งวัน
 */
export function idleSeconds(client?: SessionPayload["client"]): number {
  if (client !== "pwa") return IDLE_SECONDS;
  const n = Number(process.env.SESSION_PWA_IDLE_DAYS);
  const days = Number.isFinite(n) && n > 0 ? Math.min(n, PLATFORM_PWA_IDLE_DAYS) : PLATFORM_PWA_IDLE_DAYS;
  return Math.round(days * 24 * 3600);
}

/** เบราว์เซอร์ clamp อายุคุกกี้ไว้ที่ 400 วันอยู่แล้ว — ขอเท่าที่จะได้จริง */
const MAX_COOKIE_SECONDS = 400 * 24 * 3600;

function minutesFromEnv(name: string, fallbackMinutes: number): number {
  const n = Number(process.env[name]);
  return (Number.isFinite(n) && n > 0 ? n : fallbackMinutes) * 60;
}

const nowSec = () => Math.floor(Date.now() / 1000);

async function writeCookie(payload: SessionPayload, maxAge: number): Promise<void> {
  // ⚠ ทุก token ของระบบออกจากบรรทัดนี้บรรทัดเดียว — identityOf() ข้างใน signIdentity คือตัวรับประกัน
  // ว่า claim ทุกตัว (โดยเฉพาะ ssoSub) รอดข้ามการต่ออายุ ห้ามเซ็น token เองที่อื่น
  const token = await signIdentity(payload, secret(), maxAge);

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // prod เสิร์ฟผ่าน HTTP (LAN) → ห้ามตั้ง Secure ไม่งั้นเบราว์เซอร์ทิ้ง cookie แล้ว login วนกลับหน้าเดิม
    // เปิดเป็น true เฉพาะเมื่อ deploy หลัง HTTPS จริง (ตั้ง COOKIE_SECURE=true)
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    // แอปที่ติดตั้งถูกปิดแล้วเปิดใหม่ทั้งวัน คุกกี้จึงต้องมีอายุยาวเท่าโทเคนข้างใน ไม่งั้นผู้ใช้
    // กลับมาเจอระบบที่ลืมเขาไปแล้วทั้งที่ SchoolOS ยังล็อกอินอยู่เป็นปกติ — คนถือมือถือไม่ได้
    // อ่านอาการนั้นว่า "หมดเวลา" เขาอ่านว่า "ระบบเด้งมั่ว" · ไม่เสียความปลอดภัยอะไร เพราะ
    // นาฬิกาทั้งสองตัวอยู่ใน claims ของโทเคนและถูกเช็คใหม่ทุก request อยู่แล้ว
    maxAge: Math.min(maxAge, MAX_COOKIE_SECONDS),
  });
}

/**
 * @param absoluteEndsAt เพดานสัมบูรณ์จากภายนอก (epoch มิลลิวินาที) — ส่งค่าที่ SSO คืนมาตอน redeem
 *   เพื่อไม่ให้ session ของเราอยู่ยาวกว่า session ของแพลตฟอร์ม (ยึดอันที่ถึงก่อน)
 */
export async function createSession(
  payload: SessionPayload,
  opts?: { absoluteEndsAt?: number | null }
): Promise<void> {
  const now = nowSec();
  const theirs = typeof opts?.absoluteEndsAt === "number" ? Math.floor(opts.absoluteEndsAt / 1000) : 0;

  /**
   * เพดานของแพลตฟอร์มมาก่อนเสมอสำหรับแอปที่ติดตั้ง รวมทั้งคำตอบว่า "ไม่มีเพดาน"
   *
   * เพดานฝั่ง Users ไม่ใช่ตัวเลขเดียว: 24 ชม.สำหรับบัญชีที่มี users:write, เป็นสัปดาห์สำหรับ
   * คนอื่น และไม่มีเลยเมื่อโรงเรียนปิดสวิตช์นั้น การเอา 8 ชม.ของเราไป min() ทับ จึงเป็นการ
   * ตัดมือถือให้สั้นกว่าที่แพลตฟอร์มตั้งใจโดยที่ไม่มีอะไรฝั่งไหนอธิบายได้
   */
  const abs =
    payload.client === "pwa"
      ? theirs > now
        ? theirs
        : null // แพลตฟอร์มบอกว่าไม่มีเพดาน — คนละเรื่องกับ undefined ของโทเคนรุ่นเก่า
      : theirs > now
        ? Math.min(now + ABSOLUTE_SECONDS, theirs)
        : now + ABSOLUTE_SECONDS;

  const idle = idleSeconds(payload.client);
  await writeCookie({ ...payload, abs }, abs === null ? idle : Math.min(idle, abs - now));
}

/**
 * ต่ออายุ session ของผู้ใช้ที่ยังใช้งานอยู่ — คืนจำนวนวินาทีที่เหลือก่อนหลุด
 * คืน 0 เมื่อชนเพดานสัมบูรณ์แล้ว (ลบ cookie ทิ้งเลย ให้ไป login ใหม่)
 */
export async function touchSession(payload: SessionPayload): Promise<number> {
  const now = nowSec();
  // token เก่าที่ออกก่อนมีระบบนี้ ยังไม่มี abs — ให้เริ่มนับเพดานจากตอนนี้
  // ⚠ เทียบกับ undefined ตรง ๆ ไม่ใช่ ?? เพราะ null คือคำตอบจริง ("ไม่มีเพดาน") ไม่ใช่ "ไม่รู้"
  const abs = payload.abs === undefined ? now + ABSOLUTE_SECONDS : payload.abs;
  const idle = idleSeconds(payload.client);
  const remaining = abs === null ? idle : Math.min(idle, abs - now);
  if (remaining <= 0) {
    await destroySession();
    return 0;
  }
  await writeCookie({ ...payload, abs }, remaining);
  return remaining;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return verifyIdentity(token, secret());
}

/** เหลืออีกกี่วินาที session จะหมดอายุ (นับจาก exp ของ token ปัจจุบัน) */
export function sessionExpiresIn(payload: SessionPayload): number {
  if (payload.exp == null) return idleSeconds(payload.client); // token รุ่นเก่า — เดาเป็นเต็มช่วง idle
  return Math.max(0, payload.exp - nowSec());
}

/** verify token จาก string (ใช้ใน middleware — edge runtime) */
export async function verifyToken(token: string): Promise<SessionPayload | null> {
  return verifyIdentity(token, secret());
}

export const SESSION_COOKIE = COOKIE;

// ===== role helpers =====
export function isStaff(role?: Role): boolean {
  return role === "teacher" || role === "recorder" || role === "admin";
}
export function isRecorderOrAdmin(role?: Role): boolean {
  return role === "recorder" || role === "admin";
}
export function isAdmin(role?: Role): boolean {
  return role === "admin";
}
