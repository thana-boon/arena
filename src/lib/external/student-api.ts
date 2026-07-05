import "server-only";
import { env } from "@/lib/env";

// ===== Student API client — 2 keys แยก scope (verify / read:basic) =====

export type StudentProfile = {
  student_code: string;
  first_name: string;
  last_name: string;
  class_level: string; // เช่น "ม.1"
  class_room: string;
  [k: string]: unknown;
};

async function sfetch(path: string, key: string, init?: RequestInit) {
  const res = await fetch(`${env.STUDENT_API_BASE}${path}`, {
    ...init,
    headers: {
      "X-API-Key": key,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  return res;
}

/** ตรวจสอบ นักเรียน + เลขบัตรประชาชน 13 หลัก (scope: verify) */
export async function studentVerify(
  studentCode: string,
  citizenId: string
): Promise<boolean> {
  const res = await sfetch("/students/verify", env.STUDENT_API_KEY_VERIFY, {
    method: "POST",
    body: JSON.stringify({ student_code: studentCode, citizen_id: citizenId }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data?.match === true;
}

/** ดึงข้อมูลนักเรียน 1 คน (scope: read:basic) */
export async function fetchStudent(studentCode: string): Promise<StudentProfile | null> {
  const res = await sfetch(
    `/students/${encodeURIComponent(studentCode)}`,
    env.STUDENT_API_KEY_READ
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Student API get error: ${res.status}`);
  const data = await res.json();
  return (data.student ?? data.data ?? data) as StudentProfile;
}

/** ค้นหานักเรียน (scope: read:basic) — สำหรับครู/admin เพิ่มสมาชิกทีม */
export async function searchStudents(params: {
  q?: string;
  class_level?: string;
  class_room?: string;
}): Promise<StudentProfile[]> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.class_level) sp.set("class_level", params.class_level);
  if (params.class_room) sp.set("class_room", params.class_room);
  const res = await sfetch(`/students?${sp.toString()}`, env.STUDENT_API_KEY_READ);
  if (!res.ok) throw new Error(`Student API search error: ${res.status}`);
  const data = await res.json();
  const arr = Array.isArray(data) ? data : (data.students ?? data.data ?? []);
  return arr as StudentProfile[];
}

export function studentFullName(s: { first_name: string; last_name: string }): string {
  return `${s.first_name} ${s.last_name}`.trim();
}

/**
 * รายชื่อห้อง (distinct) ของระดับชั้นหนึ่ง เรียงแบบตัวเลข
 * ดึงทุกหน้าจนครบ total เพื่อไม่ให้พลาดห้องที่นักเรียนอยู่ท้าย ๆ
 * (Student API จำกัด limit สูงสุด ~200/หน้า ปกติ 1 หน้าครบทุกห้องอยู่แล้ว)
 */
export async function listClassRooms(classLevel: string): Promise<string[]> {
  const rooms = new Set<string>();
  const limit = 200;
  let page = 1;
  for (;;) {
    const { data, meta } = await listStudents({ class_level: classLevel, page, limit });
    for (const s of data) if (s.class_room) rooms.add(String(s.class_room).trim());
    if (data.length === 0 || page * limit >= meta.total || page >= 20) break;
    page++;
  }
  return [...rooms].sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b, "th");
  });
}

// ===== ปีการศึกษา (จาก Student API — เป็นแหล่งเดียวที่ arena ใช้สร้างปี) =====
export type ApiAcademicYear = {
  id: number;
  year_be: number;
  title: string;
  is_active?: number;
};

/** ดึงรายการปีการศึกษาทั้งหมดจาก Student API */
export async function fetchAcademicYears(): Promise<{
  current: { id: number; year_be: number; title: string } | null;
  years: ApiAcademicYear[];
}> {
  const res = await sfetch("/academic-years", env.STUDENT_API_KEY_READ);
  if (!res.ok) throw new Error(`Student API academic-years error: ${res.status}`);
  const data = await res.json();
  return {
    current: data.current ?? null,
    years: (data.years ?? []) as ApiAcademicYear[],
  };
}

// ===== รายชื่อนักเรียน (สำหรับ admin ดูรายชื่อ) — pagination =====
export type StudentListResult = {
  data: StudentProfile[];
  meta: { total: number; page: number; limit: number };
};

export async function listStudents(params: {
  q?: string;
  class_level?: string;
  class_room?: string;
  page?: number;
  limit?: number;
}): Promise<StudentListResult> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.class_level) sp.set("class_level", params.class_level);
  if (params.class_room) sp.set("class_room", params.class_room);
  sp.set("page", String(params.page ?? 1));
  sp.set("limit", String(params.limit ?? 50));
  const res = await sfetch(`/students?${sp.toString()}`, env.STUDENT_API_KEY_READ);
  if (!res.ok) throw new Error(`Student API list error: ${res.status}`);
  const data = await res.json();
  const arr = (Array.isArray(data) ? data : (data.data ?? data.students ?? [])) as StudentProfile[];
  const meta = data.meta ?? {};
  return {
    data: arr,
    meta: {
      total: Number(meta.total ?? arr.length),
      page: Number(meta.page ?? params.page ?? 1),
      limit: Number(meta.limit ?? params.limit ?? 50),
    },
  };
}
