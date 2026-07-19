import "server-only";
import {
  sosVerify,
  sosListTeachers,
  sosAllTeachers,
  type SosTeacher,
} from "@/lib/external/schoolos";
import { ensureSubjectGroupsByName, getSubjectGroupNoByName } from "@/lib/subjectGroups";

// ===== Teacher client — เดิมชี้ teacher-api, ตอนนี้ backed by SchoolOS (/api/public/v1/*) =====
// คงรูปแบบ TeacherProfile (snake_case) ไว้เท่าเดิมเพื่อไม่ให้ผู้เรียกต้องแก้

export type TeacherProfile = {
  id: number;
  teacher_code: string;
  title?: string;
  first_name: string;
  last_name: string;
  email?: string;
  subject_group?: string; // เลข groupNo (เก็บเป็น string) — map มาจากชื่อหมวดของ SchoolOS
  [k: string]: unknown;
};

/** ทำให้รหัสครูเป็นตัวใหญ่ให้ตรงกับที่ระบบเก็บ (เทียบแบบ case-insensitive ตอนค้น) */
export function normalizeTeacherCode(code: string): string {
  return code.trim().toUpperCase();
}

function toProfile(t: SosTeacher, subjectGroupNo?: number | null): TeacherProfile {
  return {
    id: t.id,
    teacher_code: t.teacherCode,
    title: t.prefix,
    first_name: t.firstName,
    last_name: t.lastName,
    email: t.email ?? undefined,
    subject_group: subjectGroupNo != null ? String(subjectGroupNo) : undefined,
  };
}

/** หาแถวครูจากรหัส (q ค้นชื่อ/รหัส แล้วกรองรหัสตรงแบบ case-insensitive) */
async function findTeacherByCode(code: string): Promise<SosTeacher | null> {
  const norm = normalizeTeacherCode(code);
  const { data } = await sosListTeachers({ q: norm, status: "all", pageSize: 50 });
  return data.find((t) => (t.teacherCode ?? "").toUpperCase() === norm) ?? null;
}

/** login ครู → คืน profile ถ้าสำเร็จ + ยังทำงานอยู่, null ถ้ารหัสผิด/ลาออก */
export async function teacherLogin(
  teacherCode: string,
  password: string
): Promise<TeacherProfile | null> {
  const user = await sosVerify("teacher", normalizeTeacherCode(teacherCode), password);
  if (!user || !user.active) return null; // ลาออก/พักงาน = เข้าไม่ได้

  // ดึงหมวด + ชื่อจริงจากรายชื่อครู (ต้องมี scope teachers:read) — พลาดได้แบบ graceful
  const row = await findTeacherByCode(user.code).catch(() => null);
  if (row) {
    const no = await getSubjectGroupNoByName(row.subjectGroup).catch(() => null);
    return toProfile(row, no);
  }

  // ไม่มีแถวครู (เช่น key ไม่มี teachers:read) — สร้าง profile ขั้นต่ำจากผล verify
  const [first, ...rest] = (user.name ?? "").split(" ");
  return {
    id: user.id,
    teacher_code: user.code,
    first_name: first ?? user.name,
    last_name: rest.join(" "),
    subject_group: undefined,
  };
}

/** รายชื่อครูทั้งหมด (admin ค้นหา/มอบสิทธิ์) — subject_group = เลข groupNo (string) */
export async function fetchAllTeachers(): Promise<TeacherProfile[]> {
  const teachers = await sosAllTeachers("active");
  const map = await ensureSubjectGroupsByName(teachers.map((t) => t.subjectGroup));
  return teachers.map((t) =>
    toProfile(t, t.subjectGroup ? map.get(t.subjectGroup.trim()) ?? null : null)
  );
}

export function teacherFullName(t: TeacherProfile): string {
  return `${t.title ?? ""}${t.first_name} ${t.last_name}`.trim();
}
