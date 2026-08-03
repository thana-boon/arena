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
  role?: string; // role ดิบจาก SchoolOS: "teacher" | "teacher-admin" — ใช้ตัดสินสิทธิ์ admin
  photo_url?: string | null; // path รูปบน SchoolOS (ต้อง proxy ผ่านฝั่งเรา)
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
    role: t.role,
    photo_url: t.photoUrl ?? null,
  };
}

/**
 * หาแถวครูจากรหัส
 * ⚠ q ค้น "ชื่อ" ได้ด้วย ไม่ใช่รหัสอย่างเดียว → ต้องกรองรหัสให้ตรงเป๊ะเองเสมอ
 * ไม่งั้นครูชื่อคล้ายกันจะถูกหยิบมาผิดคน
 */
async function findTeacherByCode(code: string, status = "all"): Promise<SosTeacher | null> {
  const norm = normalizeTeacherCode(code);
  const { data } = await sosListTeachers({ q: norm, status, pageSize: 50 });
  return data.find((t) => (t.teacherCode ?? "").toUpperCase() === norm) ?? null;
}

/** ผลการตรวจสิทธิ์ครูจากรหัส — แยก "ลาออกแล้ว" ออกจาก "ไม่มีรหัสนี้" เพราะข้อความที่ผู้ใช้เห็นคนละเรื่องกัน */
export type TeacherLookup =
  | { status: "ok"; profile: TeacherProfile }
  | { status: "inactive" } // มีรหัสนี้จริง แต่ลาออก/พักงานแล้ว
  | { status: "not_found" }; // ไม่มีรหัสนี้ในระบบเลย

/**
 * ตรวจว่ารหัสครูนี้ "ยังทำงานอยู่" ไหม แล้วคืน profile — ใช้กับทางเข้าที่ยืนยันตัวตนมาแล้วทางอื่น (SSO)
 *
 * ⚠ จำเป็นเพราะตัวตนที่ได้จาก handoff เชื่อได้แค่ "คนนี้คือใคร" เท่านั้น payload ไม่มี active/status
 * มาด้วย → ครูที่ลาออกไปแล้วแต่ session ฝั่งแพลตฟอร์มยังค้างอยู่จะเข้าระบบเราได้ถ้าไม่ตรวจซ้ำตรงนี้
 * (ทางรหัสผ่านมี user.active จาก /auth/verify คุมให้อยู่แล้ว — สองทางต้องกันคนกลุ่มเดียวกัน)
 */
export async function fetchActiveTeacher(teacherCode: string): Promise<TeacherLookup> {
  const row = await findTeacherByCode(teacherCode, "active");
  if (!row) {
    // ไม่เจอในรายชื่อที่ยังทำงานอยู่ — ถามซ้ำแบบไม่กรองสถานะเพื่อแยกสองกรณีนี้ออกจากกัน
    const any = await findTeacherByCode(teacherCode, "all").catch(() => null);
    return { status: any ? "inactive" : "not_found" };
  }
  const no = await getSubjectGroupNoByName(row.subjectGroup).catch(() => null);
  return { status: "ok", profile: toProfile(row, no) };
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
    role: user.role,
  };
}

// ===== ครูประจำชั้น =====
export type TeacherHomeroom = { classLevel: string; classRoom: string };

/**
 * ห้องที่ครูคนนี้เป็นครูประจำชั้น (จาก field homerooms ของ SchoolOS)
 * คืน [] ถ้าไม่ได้ประจำชั้น / หาแถวครูไม่เจอ — ใช้จำกัดหน้า "การสมัครรายห้อง" ของครูทั่วไป
 */
export async function fetchTeacherHomerooms(teacherCode: string): Promise<TeacherHomeroom[]> {
  const row = await findTeacherByCode(teacherCode).catch(() => null);
  return (row?.homerooms ?? [])
    .map((h) => ({ classLevel: (h.gradeLevel ?? "").trim(), classRoom: String(h.classroom ?? "").trim() }))
    .filter((h) => h.classLevel && h.classRoom);
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
