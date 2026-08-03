import "server-only";
import { env } from "@/lib/env";

// ===== SchoolOS Public API client (host ใหม่) — เรียกจาก server เท่านั้น (key ห้ามหลุด browser) =====
// เอกสาร: API-KEYS.md  ·  base = http://<host>:3002  ·  ทุก endpoint อยู่ใต้ /api/public/v1
// auth ด้วย header X-API-Key: sk_live_...

const V1 = "/api/public/v1";

// เพดานรอคำตอบต่อ request — ถ้าเครื่อง SchoolOS ช้า/ค้าง ให้ตัดแทนที่จะแขวนไม่มีกำหนด
// (loop แบ่งหน้าอย่าง sosAllTeachers ยิงต่อเนื่องหลายสิบครั้ง ถ้าไม่มี timeout จะค้างคูณจำนวนรอบ
//  — ฝั่ง loop มี "งบเวลารวม" คุมอีกชั้น ดู deadline() ใน student-api.ts)
const SOS_TIMEOUT_MS = 8_000;

async function sos(path: string, init?: RequestInit) {
  return fetch(`${env.SCHOOLOS_API_BASE}${V1}${path}`, {
    ...init,
    headers: {
      "X-API-Key": env.SCHOOLOS_API_KEY,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(SOS_TIMEOUT_MS),
  });
}

// ===== รูปแบบข้อมูลดิบจาก SchoolOS (camelCase) =====
export type SosStudent = {
  id: number;
  studentCode: string;
  prefix?: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  nickname?: string;
  gender?: string;
  birthDate?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string;
  gradeLevel?: string;
  classroom?: string | number;
  classNumber?: number;
  citizenId?: string; // เฉพาะเมื่อ key มี scope students:pii
  hasPhoto?: boolean;
  photoUrl?: string | null; // path บน SchoolOS เช่น /api/public/v1/students/1920/photo (ต้องมี API key)
};

export type SosTeacher = {
  id: number;
  teacherCode: string;
  prefix?: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  email?: string | null;
  subjectGroup?: string; // ชื่อหมวด (ไม่ใช่เลขเหมือน API เดิม)
  gradeTaught?: string;
  role?: string;
  employmentStatus?: string;
  // ห้องที่เป็นครูประจำชั้น เช่น [{gradeLevel: "ม.1", classroom: "2"}] — [] ถ้าไม่ได้ประจำชั้น
  homerooms?: { gradeLevel: string; classroom: string | number }[];
  hasPhoto?: boolean;
  photoUrl?: string | null; // path บน SchoolOS เช่น /api/public/v1/teachers/2/photo (ต้องมี API key)
};

export type SosVerifyUser = {
  id: number;
  code: string;
  name: string;
  role: string;
  active: boolean;
  status: string;
};

type Page<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  academicYear?: { id: number; year: string };
};

/** โยนเมื่อ /auth/verify ตอบ 429 (ลองบ่อยเกิน) — login route จับไปแสดงข้อความ */
export class SosRateLimitError extends Error {
  constructor() {
    super("too_many_attempts");
    this.name = "SosRateLimitError";
  }
}

/**
 * โยนเมื่อ API key ของ arena เองใช้ไม่ได้ (ไม่ได้ตั้ง / ผิด / หมดอายุ / ขาด scope)
 *
 * สำคัญ: SchoolOS ตอบ 401 ทั้งกรณี "รหัสผ่านผู้ใช้ผิด" และ "API key ใช้ไม่ได้"
 * ถ้าไม่แยกออกจากกัน ปัญหาฝั่ง config จะไปโผล่หน้า login ว่า "รหัสผ่านไม่ถูกต้อง"
 * ซึ่งไล่หาสาเหตุแทบไม่ได้เลย — เคยกินเวลาไปแล้วครั้งหนึ่ง
 */
export class SosKeyError extends Error {
  constructor(public code: string) {
    super(`schoolos_key_${code}`);
    this.name = "SosKeyError";
  }
}

/**
 * โยนเมื่อแลกโค้ด handoff ไม่ผ่าน — แยก "โค้ดของผู้ใช้หมดอายุ/ถูกใช้ไปแล้ว" (เรื่องปกติ ให้ไปกรอกรหัสผ่าน)
 * ออกจาก "config ฝั่งเราผิด" (audience/scope ไม่ได้ตั้ง — ต้องแจ้งผู้ดูแล ผู้ใช้ทำอะไรไม่ได้)
 */
export class SosHandoffError extends Error {
  constructor(public code: string) {
    super(`handoff_${code}`);
    this.name = "SosHandoffError";
  }
  /** true = ปัญหาที่ผู้ใช้แก้เองได้ด้วยการล็อกอินใหม่ / false = ปัญหา config ต้องให้ผู้ดูแลแก้ */
  get userFixable(): boolean {
    return ["invalid_code", "expired_code", "used_code", "session_ended"].includes(this.code);
  }
}

// ===== auth/handoff — แลกโค้ดใช้ครั้งเดียวจากเบราว์เซอร์ เป็นตัวตนที่ server เชื่อถือได้ =====
/**
 * เรียกจาก server เท่านั้น (ต้องใช้ X-API-Key ที่มี scope auth:handoff + audience=arena)
 *
 * นี่คือขาที่ทำให้ SSO ปลอดภัย: โค้ดขอได้เฉพาะเบราว์เซอร์ที่ถือคุกกี้ sso_session จริง
 * และแลกเป็นตัวตนได้เฉพาะผู้ที่ถือ API key ของ arena → ไม่มีทางปลอมด้วยการรู้แค่รหัสครู
 *
 * หมายเหตุ: ยิงไปที่ SSO_API_BASE ไม่ใช่ SCHOOLOS_API_BASE เพราะต้องเป็น Users อินสแตนซ์
 * เดียวกับที่เบราว์เซอร์ขอโค้ดมา (ตอน dev อาจเป็นคนละเครื่องกับที่เก็บข้อมูลครู/นักเรียน)
 */
export type SosHandoffUser = {
  sub: string;
  code: string;
  name: string;
  /** role ใน session ของ Users มีแค่สองค่านี้ — "teacher-admin" เป็น role ในฐานข้อมูล ต้องไปอ่านจาก /teachers เอง */
  role: "teacher" | "student";
};

export async function sosRedeemHandoff(code: string): Promise<{
  user: SosHandoffUser;
  expiresAt: number;
  absoluteEndsAt: number;
}> {
  let res: Response;
  try {
    res = await fetch(`${env.SSO_API_BASE}${V1}/auth/handoff/redeem`, {
      method: "POST",
      headers: { "X-API-Key": env.SCHOOLOS_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store",
      signal: AbortSignal.timeout(SOS_TIMEOUT_MS),
    });
  } catch {
    throw new SosHandoffError("unreachable");
  }

  if (!res.ok) {
    const errCode = await res
      .json()
      .then((d) => d?.error?.code as string | undefined)
      .catch(() => undefined);
    throw new SosHandoffError(errCode ?? `http_${res.status}`);
  }

  const data = await res.json().catch(() => null);
  if (!data?.valid || !data.user) throw new SosHandoffError("invalid_code");

  return {
    // sub กับ code เป็นค่าเดียวกันตามสัญญา แต่รับทั้งคู่ไว้เผื่อฝั่ง Users ส่งมาไม่ครบ
    user: { ...data.user, sub: data.user.sub ?? data.user.code } as SosHandoffUser,
    expiresAt: Number(data.expiresAt) || 0,
    absoluteEndsAt: Number(data.absoluteEndsAt) || 0,
  };
}

// ===== students =====
export async function sosListStudents(params: {
  q?: string;
  grade?: string;
  classroom?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  yearId?: number;
}): Promise<Page<SosStudent>> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.grade) sp.set("grade", params.grade);
  if (params.classroom) sp.set("classroom", params.classroom);
  if (params.status) sp.set("status", params.status);
  if (params.yearId) sp.set("yearId", String(params.yearId));
  sp.set("page", String(params.page ?? 1));
  sp.set("pageSize", String(params.pageSize ?? 50));
  const res = await sos(`/students?${sp.toString()}`);
  if (!res.ok) throw new Error(`SchoolOS students error: ${res.status}`);
  return (await res.json()) as Page<SosStudent>;
}

// ===== teachers =====
export async function sosListTeachers(params: {
  q?: string;
  subjectGroup?: string;
  role?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<Page<SosTeacher>> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.subjectGroup) sp.set("subjectGroup", params.subjectGroup);
  if (params.role) sp.set("role", params.role);
  if (params.status) sp.set("status", params.status);
  sp.set("page", String(params.page ?? 1));
  sp.set("pageSize", String(params.pageSize ?? 50));
  const res = await sos(`/teachers?${sp.toString()}`);
  if (!res.ok) throw new Error(`SchoolOS teachers error: ${res.status}`);
  return (await res.json()) as Page<SosTeacher>;
}

/** ดึงครูทุกหน้า (รายชื่อ admin + สร้างแคตตาล็อกหมวด) */
export async function sosAllTeachers(status = "active"): Promise<SosTeacher[]> {
  const out: SosTeacher[] = [];
  const pageSize = 200;
  // งบเวลารวมของทั้ง loop — ทุกหน้าช้าพร้อมกันจะได้ไม่กลายเป็นค้างยาวคูณจำนวนหน้า
  const until = Date.now() + 30_000;
  let page = 1;
  for (;;) {
    if (Date.now() > until) throw new Error("SchoolOS teachers: เกินงบเวลารวม");
    const { data, total } = await sosListTeachers({ status, page, pageSize });
    out.push(...data);
    if (data.length === 0 || page * pageSize >= total || page >= 20) break;
    page++;
  }
  return out;
}

// ===== auth/verify (ตรวจรหัสผ่าน ไม่ออก token — arena สร้าง session เอง) =====
export async function sosVerify(
  role: "student" | "teacher",
  username: string,
  password: string
): Promise<SosVerifyUser | null> {
  const res = await sos(`/auth/verify`, {
    method: "POST",
    body: JSON.stringify({ role, username, password }),
  });
  if (res.status === 429) throw new SosRateLimitError();

  if (res.status === 401 || res.status === 403) {
    // แยก "ผู้ใช้กรอกรหัสผิด" ออกจาก "key ของ arena เองใช้ไม่ได้" ด้วย error.code ใน body
    const code = await res
      .clone()
      .json()
      .then((d) => d?.error?.code as string | undefined)
      .catch(() => undefined);
    if (code && code !== "invalid_credentials") throw new SosKeyError(code);
    return null; // invalid_credentials — ไม่บอกว่ารหัสหรือ user ผิด
  }

  if (!res.ok) throw new Error(`SchoolOS auth/verify error: ${res.status}`);
  const data = await res.json();
  if (!data?.valid || !data.user) return null;
  return data.user as SosVerifyUser;
}

// ===== รูปโปรไฟล์ =====
/**
 * ดึงไฟล์รูปจาก SchoolOS (photoUrl ที่มากับ student/teacher)
 *
 * endpoint นี้ต้องแนบ X-API-Key เหมือน endpoint อื่น → เบราว์เซอร์เรียกตรงไม่ได้
 * (key ห้ามหลุด) ต้องผ่าน proxy ฝั่งเรา ดู /api/me/photo
 */
export async function sosPhoto(photoPath: string): Promise<Response> {
  // รับเฉพาะ path ใต้ /api/public/v1/ ที่ API ส่งมาเอง — กันไม่ให้กลายเป็น proxy ยิงที่ไหนก็ได้
  if (!photoPath.startsWith(`${V1}/`)) throw new Error("bad photo path");
  return fetch(`${env.SCHOOLOS_API_BASE}${photoPath}`, {
    headers: { "X-API-Key": env.SCHOOLOS_API_KEY },
    cache: "no-store",
    signal: AbortSignal.timeout(SOS_TIMEOUT_MS),
  });
}

/** ปีการศึกษาปัจจุบัน — SchoolOS ไม่มี endpoint list ปี จึงอ่านจาก field academicYear ของ /students */
export async function sosCurrentAcademicYear(): Promise<{ id: number; year: string } | null> {
  const { academicYear } = await sosListStudents({ pageSize: 1 });
  return academicYear ?? null;
}
