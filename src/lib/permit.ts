import type { SessionPayload } from "@/lib/auth/session";

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
  session: SessionPayload,
  createdByCode: string,
  groupCatalogNo: number | null | undefined
): boolean {
  if (session.role === "admin" || session.role === "recorder") return true;
  if (session.code === createdByCode) return true;
  return (
    session.subjectGroupId != null &&
    groupCatalogNo != null &&
    session.subjectGroupId === groupCatalogNo
  );
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
