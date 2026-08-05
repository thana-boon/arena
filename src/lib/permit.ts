import type { Role, SessionPayload } from "@/lib/auth/session";

/**
 * ผู้กระทำเท่าที่การตัดสินสิทธิ์ต้องรู้ — session ใช้ได้ตรง ๆ (มีครบทั้งสามช่อง)
 * แยกชนิดไว้เพื่อให้ฝั่งที่ไม่ได้ถือ session ทั้งใบ (เช่น registerEntry ที่รับแค่ role/code)
 * เรียกกฎเดียวกันได้ ไม่ต้องคัดลอกเงื่อนไขไปเขียนซ้ำแล้วหลุดไม่ตรงกันภายหลัง
 */
export type Actor = { role: Role; code: string; subjectGroupId?: number };

/** admin แก้ได้ทุกรายการ; ครู/recorder แก้ได้เฉพาะรายการที่ตัวเองสร้าง */
export function canEditCompetition(session: SessionPayload, createdByCode: string): boolean {
  if (session.role === "admin") return true;
  return session.code === createdByCode;
}

/**
 * ใครเห็นรายการได้บ้าง:
 *  - admin/recorder เห็นทุกรายการ
 *  - ครูธรรมดาเห็นเฉพาะรายการของตัวเอง + รายการในหมวด (subject group) เดียวกัน
 *
 * หมายเหตุสำคัญ: session.subjectGroupId คือ "เลขหมวด" (subject_group จาก Teacher API
 * = subject_group_catalog.group_no) ส่วน competition ผูกกับ subject_groups.id (PK รายปี)
 * จึงต้องเทียบกับ catalogNo ของหมวดนั้น ไม่ใช่ค่า id ตรง ๆ (ไม่งั้นครูมองไม่เห็นหมวดตัวเอง)
 */
export function canViewCompetition(
  actor: Actor,
  createdByCode: string,
  groupCatalogNo: number | null | undefined
): boolean {
  if (actor.role === "admin" || actor.role === "recorder") return true;
  if (actor.code === createdByCode) return true;
  return (
    actor.subjectGroupId != null &&
    groupCatalogNo != null &&
    actor.subjectGroupId === groupCatalogNo
  );
}

/**
 * รายการที่ "ซ่อนจากนักเรียน" — ใครลงชื่อให้ได้บ้าง
 *
 * รายการแบบนี้คือรายการที่ต้องคัดตัวก่อน ไม่ได้เปิดให้ใครสมัครตามใจ นักเรียนจึงมองไม่เห็น
 * และครูประจำชั้นก็ไม่ควรหยิบไปสมัครแทนนักเรียนในห้องตัวเองได้ — คนที่ลงชื่อได้คือครูที่ดูแล
 * รายการนั้นจริง ๆ (เจ้าของรายการ / ครูในหมวดเดียวกัน) กับ recorder/admin
 *
 * ใช้เกณฑ์เดียวกับ "ใครเห็นรายการนี้ในหน้าจัดการได้" เพราะเป็นคำถามเดียวกันในทางปฏิบัติ:
 * ถ้าเข้าไปจัดการรายการนั้นไม่ได้ ก็ไม่ควรยัดคนเข้ารายการนั้นได้เหมือนกัน
 */
export function canRegisterHiddenCompetition(
  actor: Actor,
  createdByCode: string,
  groupCatalogNo: number | null | undefined
): boolean {
  if (actor.role === "student") return false;
  return canViewCompetition(actor, createdByCode, groupCatalogNo);
}

/**
 * ใครบันทึกคะแนนได้: ทุกคนที่เห็นรายการนั้น — admin/recorder (ทุกรายการ),
 * เจ้าของรายการ และครูที่อยู่หมวดเดียวกับรายการ (ช่วยกันบันทึกคะแนนในหมวดตัวเองได้)
 * นักเรียนไม่เข้าเงื่อนไขนี้เพราะไม่มี subjectGroupId และไม่ได้เป็นผู้สร้างรายการ
 * แต่ให้ตัดออกชัด ๆ กันพลาด
 */
export function canScore(
  session: SessionPayload,
  createdByCode: string,
  groupCatalogNo: number | null | undefined
): boolean {
  if (session.role === "student") return false;
  return canViewCompetition(session, createdByCode, groupCatalogNo);
}
