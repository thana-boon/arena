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
    maxAge,
  });
}

/**
 * @param absoluteEndsAt เพดานสัมบูรณ์จากภายนอก (epoch มิลลิวินาที) — ส่งค่าที่ SSO คืนมาตอน redeem
 *   เพื่อไม่ให้ session ของเราอยู่ยาวกว่า session ของแพลตฟอร์ม (ยึดอันที่ถึงก่อน)
 */
export async function createSession(
  payload: SessionPayload,
  opts?: { absoluteEndsAt?: number }
): Promise<void> {
  const now = nowSec();
  const ours = now + ABSOLUTE_SECONDS;
  const theirs = opts?.absoluteEndsAt ? Math.floor(opts.absoluteEndsAt / 1000) : 0;
  const abs = theirs > now ? Math.min(ours, theirs) : ours;
  await writeCookie({ ...payload, abs }, Math.min(IDLE_SECONDS, abs - now));
}

/**
 * ต่ออายุ session ของผู้ใช้ที่ยังใช้งานอยู่ — คืนจำนวนวินาทีที่เหลือก่อนหลุด
 * คืน 0 เมื่อชนเพดานสัมบูรณ์แล้ว (ลบ cookie ทิ้งเลย ให้ไป login ใหม่)
 */
export async function touchSession(payload: SessionPayload): Promise<number> {
  const now = nowSec();
  // token เก่าที่ออกก่อนมีระบบนี้ ยังไม่มี abs — ให้เริ่มนับเพดานจากตอนนี้
  const abs = payload.abs ?? now + ABSOLUTE_SECONDS;
  const remaining = Math.min(IDLE_SECONDS, abs - now);
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
  if (payload.exp == null) return IDLE_SECONDS; // token รุ่นเก่า — เดาเป็นเต็มช่วง idle
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
