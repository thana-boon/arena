import { SignJWT, jwtVerify } from "jose";

/**
 * ===== ตัวตนใน session ของ arena — นิยาม + การเซ็น/ตรวจ token ที่เดียวของทั้งระบบ =====
 *
 * แยกออกมาจาก session.ts เพราะไฟล์นี้ต้อง "บริสุทธิ์" (ไม่แตะ next/headers ไม่ใส่ server-only)
 * จะได้เทสอัตโนมัติได้จริง — ข้อบังคับข้อหนึ่งของงานนี้คือต้องพิสูจน์ด้วยเทสว่า claim ssoSub
 * ไม่หล่นหายตอนต่ออายุ session (ดู identity.test.ts)
 */

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
   * session นี้ผูกกับ SSO ของแพลตฟอร์มอยู่ (มาจาก handoff)
   *
   * มีผลจริงสี่อย่าง: หน้าเว็บจะต่ออายุ session ของ Users ให้ด้วย, จะเช็คทุกครั้งที่ผู้ใช้กลับมา
   * ที่แท็บว่า SSO ยังอยู่ไหม (logout จากบริการอื่น = ของเราต้องดับตาม), จะเช็คว่า "ยังเป็นคนเดิม
   * อยู่ไหม" (ดู SessionGuard.tsx) และปุ่มออกจากระบบจะออกจากแพลตฟอร์มด้วย
   * · admin local ที่ไม่มีตัวตนบน SchoolOS จะไม่มีธงนี้ และไม่ถูก SSO แตะเลย
   */
  sso?: boolean;
  /**
   * sub ของ session ฝั่ง SchoolOS ที่ session ใบนี้ "ถูกคัดลอกตัวตนมา" (= รหัสครู/รหัสนักเรียน)
   *
   * ⚠ นี่คือหัวใจของการกันบั๊ก "ล็อกอินคนใหม่ที่ portal แล้วระบบยังโหลดคนเก่า"
   * sub/code ของเราเองเทียบกับ SchoolOS ไม่ได้ (คนละ namespace คนละความหมาย) จึงต้องเก็บค่าที่
   * ได้จาก redeem handoff ไว้ตรง ๆ ไม่แปลง แล้วเอาไปเทียบกับ session สดของแพลตฟอร์มทุกครั้งที่โหลดหน้า
   *
   * ⚠ ห้ามหล่นหายตอนต่ออายุ token เด็ดขาด — ถ้าหล่น บั๊กจะ "หายไป 15 นาทีแล้วกลับมา"
   * ซึ่งอ่านเหมือนของหลอน · กันด้วย identityOf() ที่เป็นทางเดียวในการสร้าง claims + เทสอัตโนมัติ
   *
   * ไม่มีค่า = session เก่าที่ออกก่อนแพตช์นี้ หรือ session ที่ล็อกอินด้วยรหัสผ่าน
   */
  ssoSub?: string;
  /** เพดานเวลาสัมบูรณ์ของ session นี้ (epoch วินาที) — ต่ออายุได้ไม่เกินเวลานี้ ต้อง login ใหม่ */
  abs?: number;
  /** exp ของ JWT (epoch วินาที) — jose ใส่มาให้ตอน verify ไม่ต้องเซ็ตเอง */
  exp?: number;
};

/** claims ที่เขียนลง token จริง — exp/iat เป็นของ jose ห้ามคัดลอกจาก token ใบเก่ามาใส่ใบใหม่ */
type TokenClaims = Omit<SessionPayload, "exp">;

/** บังคับให้ object literal ต้องระบุครบทุกคีย์ (optional ก็ต้องเขียน) — ดู identityOf */
type Complete<T> = { [K in keyof Required<T>]: T[K] };

/**
 * ชุด claims ที่จะถูกเขียนลง token — **ทางเดียว** ในการประกอบตัวตนของ session
 *
 * ⚠ ทุกจุดที่ออก token ใหม่ (login, SSO handoff, ต่ออายุ) ต้องผ่านฟังก์ชันนี้เท่านั้น
 * ห้ามเขียน object literal เองซ้ำที่ไหนอีก: วันที่เพิ่ม claim ใหม่แล้วลืมไปแก้จุดใดจุดหนึ่ง
 * claim จะหายเงียบ ๆ ตอนต่ออายุครั้งแรก แล้วบั๊กที่แก้ไปแล้วจะกลับมาโดยไม่มีอะไรฟ้อง
 *
 * ⚠ ชนิด Complete<TokenClaims> ทำให้ "ลืมคัดลอกฟิลด์" กลายเป็น error ตอน typecheck
 * เพิ่มฟิลด์ใหม่ใน SessionPayload แล้วไม่มาเพิ่มที่นี่ = build ไม่ผ่าน (ตั้งใจให้เป็นแบบนั้น)
 */
export function identityOf(claims: SessionPayload): TokenClaims {
  const identity: Complete<TokenClaims> = {
    role: claims.role,
    code: claims.code,
    name: claims.name,
    firstName: claims.firstName,
    photo: claims.photo,
    classLevel: claims.classLevel,
    classRoom: claims.classRoom,
    subjectGroupId: claims.subjectGroupId,
    sso: claims.sso,
    ssoSub: claims.ssoSub,
    abs: claims.abs,
  };
  return identity;
}

/** เซ็น token ใบใหม่จากตัวตนเดิม (jose ตัดคีย์ที่เป็น undefined ทิ้งให้เองตอน serialize) */
export async function signIdentity(
  claims: SessionPayload,
  secret: Uint8Array,
  maxAgeSeconds: number
): Promise<string> {
  return new SignJWT({ ...identityOf(claims) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secret);
}

/** ตรวจ token — คืน null เมื่อไม่ผ่าน (หมดอายุ / ลายเซ็นไม่ตรง / ไม่ใช่ JWT) */
export async function verifyIdentity(token: string, secret: Uint8Array): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
