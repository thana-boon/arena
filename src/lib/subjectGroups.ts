import "server-only";
import { db } from "@/db";
import { subjectGroupCatalog } from "@/db/schema";
import { fetchSubjectGroups } from "@/lib/external/teacher-api";

/**
 * แคตตาล็อกหมวด (กลุ่มสาระ) เป็น "แหล่งความจริงเดียว" ที่ใช้ร่วมกัน:
 *  - แสดงชื่อหมวดของครู (แทนตัวเลข subject_group)
 *  - เป็นตัวเลือกหมวดวิชาของรายการแข่งขัน
 * ข้อมูลชื่อหมวดมาจาก Teacher API (GET /api/subject-groups) เท่านั้น
 */

/** ดึงหมวดจาก Teacher API แล้ว upsert ลงแคตตาล็อก คืนรายการล่าสุด (เรียงตาม groupNo) */
export async function syncSubjectGroupCatalog(): Promise<
  { groupNo: number; name: string }[]
> {
  const groups = await fetchSubjectGroups();
  for (const g of groups) {
    if (!Number.isFinite(g.id)) continue;
    await db
      .insert(subjectGroupCatalog)
      .values({ groupNo: g.id, name: g.name })
      .onDuplicateKeyUpdate({ set: { name: g.name } });
  }
  return getSubjectGroupCatalog();
}

/** อ่านแคตตาล็อกจาก DB (ไม่เรียก Teacher API) */
export async function getSubjectGroupCatalog(): Promise<
  { groupNo: number; name: string }[]
> {
  const rows = await db.select().from(subjectGroupCatalog);
  return rows
    .map((r) => ({ groupNo: r.groupNo, name: r.name }))
    .sort((a, b) => a.groupNo - b.groupNo);
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
