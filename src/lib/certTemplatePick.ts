import type { CertAward } from "@/lib/domain";

/**
 * "ใบนี้ใช้แม่แบบไหน" — ตรรกะล้วน ไม่แตะ DB (อยู่แยกจาก lib/certificates.ts ที่เป็น server-only
 * เพราะเป็นกฎที่พังแล้วเสียหายที่สุดในระบบเกียรติบัตร: เลือกผิด = แจกใบผิดแบบไปทั้งงาน)
 */

/** เท่าที่การเลือกแม่แบบต้องรู้ (แม่แบบจริงมีมากกว่านี้ — ดู CertTemplateView) */
export type TemplatePick = {
  id: number;
  isDefault: boolean;
  competitionIds: number[];
  medalFilter: string;
};

/**
 * เลือกแม่แบบของใบหนึ่ง — ไล่จากเจาะจงที่สุดไปกว้างที่สุด
 *
 *   1) แบบที่ "รายการนี้" ถูกผูกไว้โดยตรง (งานเดียวกันแต่รายการอบรมกับรายการที่ตัดสินจริงคนละใบ)
 *   2) แบบหลักของงาน (รายการที่ไม่ได้ผูกไว้ใช้ตัวนี้)
 *   3) แบบเฉพาะเหรียญ / แบบ medalFilter = "" — ทางเดิมของงานที่ยังไม่มีการผูกแบบใด ๆ
 *
 * "activity" (รายการที่ไม่มีการแข่งขัน) ไม่มีแม่แบบเฉพาะเหรียญ → ตกไปใช้แบบหลักเสมอ
 */
export function resolveTemplate<T extends TemplatePick>(
  tpls: T[],
  medal: CertAward,
  competitionId?: number
): T | null {
  if (competitionId != null) {
    const bound = tpls.filter((t) => t.competitionIds.includes(competitionId));
    const hit =
      bound.find((t) => t.medalFilter === medal) ?? bound.find((t) => t.medalFilter === "") ?? bound[0];
    if (hit) return hit;
  }
  return (
    tpls.find((t) => t.isDefault && t.medalFilter === medal) ??
    tpls.find((t) => t.isDefault) ??
    tpls.find((t) => t.medalFilter === medal) ??
    tpls.find((t) => t.medalFilter === "") ??
    null
  );
}

/** แบบหลักของงาน (ตัวที่หน้าออกแบบเปิดให้ก่อน) — งานเก่าที่ยังไม่มีธง isDefault ใช้ตัวแรก */
export function mainTemplate<T extends TemplatePick>(tpls: T[]): T | null {
  return tpls.find((t) => t.isDefault) ?? tpls.find((t) => t.medalFilter === "") ?? tpls[0] ?? null;
}
