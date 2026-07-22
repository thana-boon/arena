import "server-only";
import {
  sosVerify,
  sosListStudents,
  sosCurrentAcademicYear,
  type SosStudent,
} from "@/lib/external/schoolos";

// ===== Student client — เดิมชี้ students-api, ตอนนี้ backed by SchoolOS (/api/public/v1/*) =====
// คงรูปแบบ StudentProfile (snake_case) ไว้เท่าเดิมเพื่อไม่ให้ผู้เรียกต้องแก้

export type StudentProfile = {
  student_code: string;
  first_name: string;
  last_name: string;
  class_level: string; // เช่น "ม.1"
  class_room: string;
  [k: string]: unknown;
};

function toProfile(s: SosStudent): StudentProfile {
  return {
    student_code: s.studentCode,
    first_name: s.firstName,
    last_name: s.lastName,
    class_level: s.gradeLevel ?? "",
    class_room: s.classroom != null ? String(s.classroom) : "",
  };
}

export function studentFullName(s: { first_name: string; last_name: string }): string {
  return `${s.first_name} ${s.last_name}`.trim();
}

/** ดึงข้อมูลนักเรียน 1 คนจากรหัส (ค้นด้วย q แล้วกรองรหัสตรงเป๊ะ) */
export async function fetchStudent(studentCode: string): Promise<StudentProfile | null> {
  const code = studentCode.trim();
  const { data } = await sosListStudents({ q: code, status: "all", pageSize: 50 });
  const hit = data.find((s) => String(s.studentCode) === code);
  return hit ? toProfile(hit) : null;
}

/** login นักเรียนผ่าน SchoolOS (/auth/verify) — คืน profile ถ้าสำเร็จ + ยังเรียนอยู่ */
export async function studentLogin(
  username: string,
  password: string
): Promise<StudentProfile | null> {
  const user = await sosVerify("student", username.trim(), password);
  if (!user || !user.active) return null; // ลาออก/จบแล้ว = เข้าไม่ได้

  const profile = await fetchStudent(user.code).catch(() => null);
  if (profile) return profile;

  // ไม่มีแถวนักเรียน (เช่น key ไม่มี students:read) — สร้าง profile ขั้นต่ำจากผล verify
  const [first, ...rest] = (user.name ?? "").split(" ");
  return {
    student_code: user.code,
    first_name: first ?? user.name,
    last_name: rest.join(" "),
    class_level: "",
    class_room: "",
  };
}

/** ค้นหานักเรียน — สำหรับครู/admin เพิ่มสมาชิกทีม */
export async function searchStudents(params: {
  q?: string;
  class_level?: string;
  class_room?: string;
}): Promise<StudentProfile[]> {
  const { data } = await sosListStudents({
    q: params.q,
    grade: params.class_level,
    classroom: params.class_room,
    pageSize: 50,
  });
  return data.map(toProfile);
}

// ===== รายชื่อนักเรียน (pagination) =====
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
  const r = await sosListStudents({
    q: params.q,
    grade: params.class_level,
    classroom: params.class_room,
    page: params.page ?? 1,
    pageSize: params.limit ?? 50,
  });
  return {
    data: r.data.map(toProfile),
    meta: { total: r.total, page: r.page, limit: r.pageSize },
  };
}

/**
 * รายชื่อห้อง (distinct) ของระดับชั้นหนึ่ง เรียงแบบตัวเลข
 * ดึงทุกหน้าจนครบ total เพื่อไม่ให้พลาดห้องที่นักเรียนอยู่ท้าย ๆ
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

/** นักเรียนทั้งห้อง (ทุกหน้า) — ใช้หน้า "การสมัครรายห้อง" */
export async function listStudentsInRoom(
  classLevel: string,
  classRoom: string
): Promise<StudentProfile[]> {
  const out: StudentProfile[] = [];
  const limit = 200;
  let page = 1;
  for (;;) {
    const { data, meta } = await listStudents({
      class_level: classLevel,
      class_room: classRoom,
      page,
      limit,
    });
    out.push(...data);
    if (data.length === 0 || page * limit >= meta.total || page >= 10) break;
    page++;
  }
  return out;
}

/** นักเรียนทุกคนทุกห้อง (ทุกหน้า) — ใช้ทำภาพรวมการสมัครรายห้องของ admin */
export async function listAllStudents(): Promise<StudentProfile[]> {
  const out: StudentProfile[] = [];
  const limit = 200;
  let page = 1;
  for (;;) {
    const { data, meta } = await listStudents({ page, limit });
    out.push(...data);
    if (data.length === 0 || page * limit >= meta.total || page >= 30) break;
    page++;
  }
  return out;
}

// ===== ปีการศึกษา =====
// SchoolOS ไม่มี endpoint "list ปีทั้งหมด" — ดึงได้เฉพาะปีปัจจุบัน (จาก field academicYear ของ /students)
export type ApiAcademicYear = {
  id: number;
  year_be: number;
  title: string;
  is_active?: number;
};

export async function fetchAcademicYears(): Promise<{
  current: { id: number; year_be: number; title: string } | null;
  years: ApiAcademicYear[];
}> {
  const ay = await sosCurrentAcademicYear();
  if (!ay) return { current: null, years: [] };
  const year_be = Number(ay.year);
  const title = `ปีการศึกษา ${ay.year}`;
  return {
    current: { id: ay.id, year_be, title },
    years: [{ id: ay.id, year_be, title, is_active: 1 }],
  };
}
