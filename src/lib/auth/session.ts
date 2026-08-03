import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

export type Role = "student" | "teacher" | "recorder" | "admin";

export type SessionPayload = {
  role: Role;
  code: string; // student_code / teacher_code / admin username
  name: string;
  firstName?: string; // ชื่อจริงล้วน (ไม่มีคำนำหน้า) — ใช้ทำตัวอักษรย่อบน avatar
  photo?: string; // path รูปบน SchoolOS — ไม่มีรูป = undefined (ดู /api/me/photo)
  classLevel?: string; // สำหรับนักเรียน
  classRoom?: string;
  subjectGroupId?: number; // หมวด (กลุ่มสาระ) ของครู — ใช้กรองรายการที่เห็น
  /**
   * session นี้ผูกกับ SSO ของแพลตฟอร์มอยู่ (มาจาก handoff หรือล็อกอินแล้วเปิด SSO ต่อสำเร็จ)
   *
   * มีผลจริงสองอย่าง: หน้าเว็บจะต่ออายุ SSO ให้ด้วย และจะเช็คทุกครั้งที่ผู้ใช้กลับมาที่แท็บว่า
   * SSO ยังอยู่ไหม — ถ้าผู้ใช้ logout จากบริการอื่น session ฝั่งเราต้องดับตาม
   * (admin local ที่ไม่มีตัวตนบน SchoolOS จะไม่มีธงนี้ และไม่ถูกแตะโดย SSO เลย)
   */
  sso?: boolean;
  /** เพดานเวลาสัมบูรณ์ของ session นี้ (epoch วินาที) — ต่ออายุได้ไม่เกินเวลานี้ ต้อง login ใหม่ */
  abs?: number;
  /** exp ของ JWT (epoch วินาที) — jose ใส่มาให้ตอน verify ไม่ต้องเซ็ตเอง */
  exp?: number;
};

const COOKIE = "arena_session";
const secret = () => new TextEncoder().encode(env.JWT_SECRET);

/**
 * อายุ session แบ่งเป็นสองชั้น
 * - IDLE: ไม่มีการใช้งานเกินเท่านี้ → หลุดเอง (ค่า exp ของ JWT + maxAge ของ cookie)
 *   ทุกครั้งที่ยังใช้งานอยู่ ฝั่งหน้าเว็บจะ ping มาต่ออายุให้ (ดู SessionTimeout.tsx)
 * - ABSOLUTE: นับจากตอน login ครั้งแรก ต่ออายุได้ไม่เกินเท่านี้ ต้อง login ใหม่เสมอ
 * ปรับได้ผ่าน env — ค่าเริ่มต้น 30 นาที / 8 ชม.
 *
 * เพดาน 8 ชม. ตั้งให้ "ตรงกับเพดานสัมบูรณ์ของ SSO ฝั่ง SchoolOS" โดยตั้งใจ
 * ถ้าตั้งยาวกว่า จะเกิดช่วงเวลาที่ session แพลตฟอร์มตายแล้วแต่ของเรายังอยู่ = ผู้ใช้เจอ
 * บริการอื่นเด้งให้ล็อกอินแต่ arena ไม่เด้ง ซึ่งอธิบายให้ครูเข้าใจยากมาก
 */
export const IDLE_SECONDS = minutesFromEnv("SESSION_IDLE_MINUTES", 30);
export const ABSOLUTE_SECONDS = minutesFromEnv("SESSION_ABSOLUTE_MINUTES", 60 * 8);

function minutesFromEnv(name: string, fallbackMinutes: number): number {
  const n = Number(process.env[name]);
  return (Number.isFinite(n) && n > 0 ? n : fallbackMinutes) * 60;
}

const nowSec = () => Math.floor(Date.now() / 1000);

async function writeCookie(payload: SessionPayload, maxAge: number): Promise<void> {
  // exp/iat มาจาก token ใบเก่า — ต้องไม่ติดไปกับใบใหม่ (jose จะเซ็ตให้เองด้านล่าง)
  const { exp: _exp, ...rest } = payload;
  const token = await new SignJWT({ ...rest })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secret());

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
 * @param absoluteEndsAt เพดานสัมบูรณ์จากภายนอก (epoch มิลลิวินาที) — ส่ง absoluteEndsAt ที่ SSO คืนมา
 *   เพื่อไม่ให้ session ของเราอยู่ยาวกว่า session ของแพลตฟอร์ม (เอาอันที่ถึงก่อน)
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
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** เหลืออีกกี่วินาที session จะหมดอายุ (นับจาก exp ของ token ปัจจุบัน) */
export function sessionExpiresIn(payload: SessionPayload): number {
  if (payload.exp == null) return IDLE_SECONDS; // token รุ่นเก่า — เดาเป็นเต็มช่วง idle
  return Math.max(0, payload.exp - nowSec());
}

/** verify token จาก string (ใช้ใน middleware — edge runtime) */
export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
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
