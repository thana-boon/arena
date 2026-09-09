import "server-only";
import { db } from "@/db";
import { competitionSubjectGroups, subjectGroups } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * หมวดร่วมของรายการแข่งขัน — รายการหนึ่งทำงานร่วมกันได้หลายกลุ่มสาระ
 *
 * โครงเก็บข้อมูล: หมวดหลัก (เจ้าของ) อยู่ที่ competitions.subject_group_id เหมือนเดิม
 * ส่วนตาราง competition_subject_groups เก็บเฉพาะ "หมวดร่วม" ที่เพิ่มเข้ามา
 * — ไม่มีแถว = รายการหมวดเดียวแบบเดิม จึงไม่ต้อง backfill ข้อมูลเก่า และการจัดกลุ่ม/เรียง/
 * ชื่อหมวดบนเกียรติบัตรยังตอบได้ว่าหมวดไหนคือเจ้าของ (คำถามที่ต้องมีคำตอบเดียวเสมอ)
 *
 * เรื่องสิทธิ์: ครูในหมวดร่วมได้สิทธิ์เท่าครูในหมวดเจ้าของ (เห็น/แก้/บันทึกคะแนน) —
 * นั่นคือเหตุผลที่มีฟีเจอร์นี้ ทุกจุดจึงต้องส่ง "เลขหมวดทั้งหมด" เข้า permit ไม่ใช่แค่หมวดหลัก
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * คัดเฉพาะ id หมวดที่มีอยู่จริงในปีนี้ (ทิ้งค่าที่ไม่รู้จัก/ปีอื่นเงียบ ๆ)
 *
 * หมวดร่วมไม่ผูกกับ isGroupAllowed เหมือนหมวดหลัก: หมวดหลักคือ "ของใคร" (ครูตั้งได้เฉพาะหมวดตัวเอง)
 * ส่วนหมวดร่วมคือ "ชวนใครมาทำด้วย" — คนที่ชวนได้ต้องแก้รายการนี้ได้อยู่แล้ว จึงไม่จำกัดว่าเป็นหมวดใด
 */
export async function validGroupIdsInYear(yearId: number, ids: number[]): Promise<number[]> {
  const want = [...new Set(ids)];
  if (!want.length) return [];
  const rows = await db
    .select({ id: subjectGroups.id })
    .from(subjectGroups)
    .where(and(eq(subjectGroups.yearId, yearId), inArray(subjectGroups.id, want)));
  const okIds = new Set(rows.map((r) => r.id));
  return want.filter((id) => okIds.has(id));
}

/** id หมวดร่วมของรายการเดียว (เรียงตามลำดับที่เลือกในฟอร์ม) */
export async function getCoGroupIds(compId: number): Promise<number[]> {
  const rows = await db
    .select({ subjectGroupId: competitionSubjectGroups.subjectGroupId, sortOrder: competitionSubjectGroups.sortOrder })
    .from(competitionSubjectGroups)
    .where(eq(competitionSubjectGroups.competitionId, compId));
  return rows.sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.subjectGroupId);
}

/** map compId → id หมวดร่วม (สำหรับหน้าที่โหลดหลายรายการพร้อมกัน) */
export async function getCoGroupIdsByCompetition(compIds: number[]): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  if (!compIds.length) return out;
  const rows = await db
    .select()
    .from(competitionSubjectGroups)
    .where(inArray(competitionSubjectGroups.competitionId, compIds));
  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  for (const r of rows) out.set(r.competitionId, [...(out.get(r.competitionId) ?? []), r.subjectGroupId]);
  return out;
}

/**
 * เขียนหมวดร่วมใหม่ทั้งชุด (ลบของเดิมแล้วใส่ตามลำดับในฟอร์ม)
 * ตัดหมวดหลักและตัวซ้ำออกให้เอง — หมวดหลักไม่ใช่ "หมวดร่วม" และไม่ควรถูกนับสองครั้ง
 */
export async function writeCoGroups(
  tx: Tx,
  compId: number,
  primaryGroupId: number | null,
  coGroupIds: number[]
) {
  await tx.delete(competitionSubjectGroups).where(eq(competitionSubjectGroups.competitionId, compId));
  const ids = [...new Set(coGroupIds)].filter((g) => g !== primaryGroupId);
  if (!ids.length) return;
  await tx
    .insert(competitionSubjectGroups)
    .values(ids.map((gid, i) => ({ competitionId: compId, subjectGroupId: gid, sortOrder: i })));
}

/**
 * เลขหมวด (subject_group_catalog.group_no) ของทุกหมวดที่รายการนี้ผูกอยู่ (หลัก + ร่วม)
 * ใช้ส่งเข้า canEditCompetition / canViewCompetition / canScore ที่เทียบกับ session.subjectGroupId
 */
export async function competitionCatalogNos(
  compId: number,
  primaryGroupId: number | null
): Promise<number[]> {
  const ids = [...(primaryGroupId == null ? [] : [primaryGroupId]), ...(await getCoGroupIds(compId))];
  if (!ids.length) return [];
  const rows = await db
    .select({ catalogNo: subjectGroups.catalogNo })
    .from(subjectGroups)
    .where(inArray(subjectGroups.id, ids));
  return rows.map((r) => r.catalogNo).filter((n): n is number => n != null);
}
