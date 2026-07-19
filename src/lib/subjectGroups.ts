import "server-only";
import { db } from "@/db";
import { subjectGroupCatalog } from "@/db/schema";
import { sosAllTeachers } from "@/lib/external/schoolos";

/**
 * แคตตาล็อกหมวด (กลุ่มสาระ) เป็น "แหล่งความจริงเดียว" ที่ใช้ร่วมกัน:
 *  - แสดงชื่อหมวดของครู
 *  - เป็นตัวเลือกหมวดวิชาของรายการแข่งขัน (ผูกด้วยเลข groupNo)
 *
 * SchoolOS ส่งหมวดมาเป็น "ชื่อ" (ไม่มีเลขเหมือน API เดิม) — arena จึงเก็บชื่อลงแคตตาล็อก
 * แล้วให้เลข groupNo เอง โดย **จับคู่ด้วยชื่อ** เพื่อคงเลขเดิมของหมวดที่มีอยู่แล้วไว้
 * (ของเก่าที่อ้าง catalogNo อยู่จะไม่เพี้ยน ตราบใดที่ชื่อหมวดยังตรงกัน)
 */

/** อ่านแคตตาล็อกจาก DB (ไม่เรียก API) */
export async function getSubjectGroupCatalog(): Promise<
  { groupNo: number; name: string }[]
> {
  const rows = await db.select().from(subjectGroupCatalog);
  return rows
    .map((r) => ({ groupNo: r.groupNo, name: r.name }))
    .sort((a, b) => a.groupNo - b.groupNo);
}

/**
 * รับรายชื่อหมวด แล้ว upsert เฉพาะชื่อที่ยังไม่มี (ให้เลขต่อจากเลขสูงสุดเดิม)
 * คืน map ชื่อ → groupNo ของทุกหมวดในแคตตาล็อก
 */
export async function ensureSubjectGroupsByName(
  names: (string | null | undefined)[]
): Promise<Map<string, number>> {
  const clean = [...new Set(names.map((n) => (n ?? "").trim()).filter(Boolean))];
  const existing = await getSubjectGroupCatalog();
  const byName = new Map(existing.map((r) => [r.name, r.groupNo]));
  let nextNo = existing.reduce((m, r) => Math.max(m, r.groupNo), 0) + 1;

  for (const name of clean) {
    if (byName.has(name)) continue;
    await db
      .insert(subjectGroupCatalog)
      .values({ groupNo: nextNo, name })
      .onConflictDoNothing();
    byName.set(name, nextNo);
    nextNo++;
  }
  return byName;
}

/** ซิงค์แคตตาล็อกจากรายชื่อครูใน SchoolOS (distinct subjectGroup) คืนรายการล่าสุด */
export async function syncSubjectGroupCatalog(): Promise<
  { groupNo: number; name: string }[]
> {
  const teachers = await sosAllTeachers("active");
  await ensureSubjectGroupsByName(teachers.map((t) => t.subjectGroup));
  return getSubjectGroupCatalog();
}

/** ชื่อหมวด → เลข groupNo (สร้างเลขใหม่ให้อัตโนมัติถ้ายังไม่รู้จัก) */
export async function getSubjectGroupNoByName(
  name: string | null | undefined
): Promise<number | null> {
  if (!name || !name.trim()) return null;
  const map = await ensureSubjectGroupsByName([name]);
  return map.get(name.trim()) ?? null;
}

/** Map เลขหมวด → ชื่อ (จากแคตตาล็อกใน DB) */
export async function getSubjectGroupMap(): Promise<Map<number, string>> {
  const rows = await getSubjectGroupCatalog();
  return new Map(rows.map((r) => [r.groupNo, r.name]));
}

/** แปลงเลขหมวดเป็นชื่อ (fallback เป็น "หมวด {n}" ถ้ายังไม่รู้จัก) */
export function subjectGroupLabel(
  no: number | null | undefined,
  map: Map<number, string>
): string {
  if (no == null) return "-";
  const name = map.get(Number(no));
  return name && name.trim() ? name : `หมวด ${no}`;
}
