import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

export type Role = "student" | "teacher" | "recorder" | "admin";

export type SessionPayload = {
  role: Role;
  code: string; // student_code / teacher_code / admin username
  name: string;
  classLevel?: string; // สำหรับนักเรียน
  classRoom?: string;
  subjectGroupId?: number; // หมวด (กลุ่มสาระ) ของครู — ใช้กรองรายการที่เห็น
};

const COOKIE = "arena_session";
const secret = () => new TextEncoder().encode(env.JWT_SECRET);
const MAX_AGE = 60 * 60 * 12; // 12 ชม.

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // prod เสิร์ฟผ่าน HTTP (LAN) → ห้ามตั้ง Secure ไม่งั้นเบราว์เซอร์ทิ้ง cookie แล้ว login วนกลับหน้าเดิม
    // เปิดเป็น true เฉพาะเมื่อ deploy หลัง HTTPS จริง (ตั้ง COOKIE_SECURE=true)
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: MAX_AGE,
  });
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
