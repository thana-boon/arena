import "server-only";
import { db } from "@/db";
import { subjectGroups } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * ครูเลือก/สร้างรายการได้เฉพาะ "หมวดของตัวเอง" เท่านั้น — ยกเว้น admin เลือกได้ทุกหมวด
 *
 * หมายเหตุ: session.subjectGroupId = เลขหมวดของครู (= subject_group จาก Teacher API
 * = subjectGroups.catalogNo) ส่วนรายการแข่งขันผูกกับ subjectGroups.id (PK รายปี)
 * จึงต้องเทียบกับ catalogNo ของหมวดนั้น ไม่ใช่ค่า id ตรง ๆ
 */

/** ตัวกรอง (pure) สำหรับคัดหมวดที่ครูเลือกได้ตอนสร้าง/แก้ไขในฟอร์ม */
export function canPickGroup(
  session: SessionPayload,
  catalogNo: number | null | undefined
): boolean {
  if (session.role === "admin") return true;
  return (
    session.subjectGroupId != null &&
    catalogNo != null &&
    session.subjectGroupId === catalogNo
  );
}

/** ตรวจฝั่งเซิร์ฟเวอร์ว่า group ที่ส่งมา (subjectGroups.id) เป็นหมวดที่ครูใช้ได้จริง */
export async function isGroupAllowed(
  session: SessionPayload,
  yearId: number,
  groupId: number
): Promise<boolean> {
  if (session.role === "admin") return true;
  const grp = (
    await db
      .select()
      .from(subjectGroups)
      .where(and(eq(subjectGroups.id, groupId), eq(subjectGroups.yearId, yearId)))
      .limit(1)
  )[0];
  return !!grp && grp.catalogNo != null && grp.catalogNo === session.subjectGroupId;
}
