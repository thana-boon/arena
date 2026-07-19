import "server-only";
import { env } from "@/lib/env";

// ===== SchoolOS Public API client (host ใหม่) — เรียกจาก server เท่านั้น (key ห้ามหลุด browser) =====
// เอกสาร: API-KEYS.md  ·  base = http://<host>:3002  ·  ทุก endpoint อยู่ใต้ /api/public/v1
// auth ด้วย header X-API-Key: sk_live_...

const V1 = "/api/public/v1";

async function sos(path: string, init?: RequestInit) {
  return fetch(`${env.SCHOOLOS_API_BASE}${V1}${path}`, {
    ...init,
    headers: {
      "X-API-Key": env.SCHOOLOS_API_KEY,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
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
  let page = 1;
  for (;;) {
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
  if (res.status === 401) return null; // invalid_credentials — ไม่บอกว่ารหัสหรือ user ผิด
  if (res.status === 429) throw new SosRateLimitError();
  if (!res.ok) throw new Error(`SchoolOS auth/verify error: ${res.status}`);
  const data = await res.json();
  if (!data?.valid || !data.user) return null;
  return data.user as SosVerifyUser;
}

/** ปีการศึกษาปัจจุบัน — SchoolOS ไม่มี endpoint list ปี จึงอ่านจาก field academicYear ของ /students */
export async function sosCurrentAcademicYear(): Promise<{ id: number; year: string } | null> {
  const { academicYear } = await sosListStudents({ pageSize: 1 });
  return academicYear ?? null;
}
