import "server-only";
import { env } from "@/lib/env";

// ===== Teacher API client — เรียกจาก server เท่านั้น (key ห้ามหลุด browser) =====

export type TeacherProfile = {
  id: number;
  teacher_code: string;
  title?: string;
  first_name: string;
  last_name: string;
  email?: string;
  subject_group?: string;
  [k: string]: unknown;
};

async function tfetch(path: string, init?: RequestInit) {
  const res = await fetch(`${env.TEACHER_API_BASE}${path}`, {
    ...init,
    headers: {
      "x-api-key": env.TEACHER_API_KEY,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  return res;
}

/** ทำให้รหัสครูเป็นรูปแบบมาตรฐาน (ตัวใหญ่) — Teacher API เก็บรหัสเป็นตัวใหญ่ (เช่น A00001, T00)
 *  และเทียบแบบ case-sensitive จึงต้อง normalize ก่อน เพื่อให้พิมพ์ t เล็ก/ใหญ่ ได้เหมือนกัน */
export function normalizeTeacherCode(code: string): string {
  return code.trim().toUpperCase();
}

/** login ครู → คืน profile ถ้าสำเร็จ, null ถ้า 401, throw ถ้า error อื่น */
export async function teacherLogin(
  teacherCode: string,
  password: string
): Promise<TeacherProfile | null> {
  const res = await tfetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ teacher_code: normalizeTeacherCode(teacherCode), password }),
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Teacher API login error: ${res.status}`);
  const data = await res.json();
  // รองรับทั้งกรณี API ห่อ { teacher: {...} } หรือคืน object ตรง ๆ
  return (data.teacher ?? data.data ?? data) as TeacherProfile;
}

/** รายชื่อครูทั้งหมด (สำหรับ admin ค้นหา/มอบสิทธิ์) */
export async function fetchAllTeachers(): Promise<TeacherProfile[]> {
  const res = await tfetch("/api/teachers");
  if (!res.ok) throw new Error(`Teacher API list error: ${res.status}`);
  const data = await res.json();
  const arr = Array.isArray(data) ? data : (data.teachers ?? data.data ?? []);
  return arr as TeacherProfile[];
}

export function teacherFullName(t: TeacherProfile): string {
  return `${t.title ?? ""}${t.first_name} ${t.last_name}`.trim();
}

export type TeacherSubjectGroup = { id: number; name: string };

/** รายการหมวด (กลุ่มสาระ) จาก Teacher API — id ตรงกับ field subject_group ของครู */
export async function fetchSubjectGroups(): Promise<TeacherSubjectGroup[]> {
  const res = await tfetch("/api/subject-groups");
  if (!res.ok) throw new Error(`Teacher API subject-groups error: ${res.status}`);
  const data = await res.json();
  const arr = Array.isArray(data) ? data : (data.subject_groups ?? data.data ?? []);
  return (arr as Array<{ id: number | string; name?: string }>).map((g) => ({
    id: Number(g.id),
    name: String(g.name ?? "").trim(),
  }));
}
