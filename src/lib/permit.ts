import type { Role, SessionPayload } from "@/lib/auth/session";
import {
  competitionEditWindow,
  registrationWindow,
  type CompEditWindowEvent,
  type RegWindowEvent,
} from "@/lib/domain";

/**
 * ผู้กระทำเท่าที่การตัดสินสิทธิ์ต้องรู้ — session ใช้ได้ตรง ๆ (มีครบทั้งสามช่อง)
 * แยกชนิดไว้เพื่อให้ฝั่งที่ไม่ได้ถือ session ทั้งใบ (เช่น registerEntry ที่รับแค่ role/code)
 * เรียกกฎเดียวกันได้ ไม่ต้องคัดลอกเงื่อนไขไปเขียนซ้ำแล้วหลุดไม่ตรงกันภายหลัง
 */
export type Actor = { role: Role; code: string; subjectGroupId?: number };

/**
 * ใครแก้/ลบรายการได้: admin ทุกรายการ · ครู = รายการที่ตัวเองสร้าง หรือรายการในหมวดเดียวกับตัวเอง
 *
 * เดิมดูแค่ "ใครเป็นคนสร้าง" ครูจึงเห็นรายการของเพื่อนร่วมหมวด (canViewCompetition ให้เห็นอยู่แล้ว)
 * แต่แตะอะไรไม่ได้เลย ทั้งที่ช่วยกันดูแลหมวดเดียวกัน — บันทึกคะแนน/ออกเกียรติบัตรก็ให้สิทธิ์ระดับหมวดอยู่แล้ว
 *
 * ต่างจาก canViewCompetition ตรงที่ recorder ไม่ได้สิทธิ์แก้ทุกรายการ: recorder มีไว้บันทึกคะแนนแทนครู
 * ไม่ใช่แก้โครงสร้าง/ลบรายการของหมวดที่ตัวเองไม่ได้สังกัด
 *
 * เป็นคำถาม "ใคร" ล้วน ๆ — "ตอนนี้ถึงเวลาไหม" อยู่ที่ competitionManageGuard ต้องผ่านทั้งคู่
 */
export function canEditCompetition(
  actor: Actor,
  createdByCode: string,
  groupCatalogNo: number | null | undefined
): boolean {
  if (actor.role === "admin") return true;
  if (actor.role === "student") return false;
  if (actor.code === createdByCode) return true;
  return (
    actor.subjectGroupId != null &&
    groupCatalogNo != null &&
    actor.subjectGroupId === groupCatalogNo
  );
}

/**
 * ตอนนี้จัดการรายการแข่งขัน (สร้าง/แก้ไข/ลบ) ในงานนี้ได้ไหม
 *
 * แยกจาก canEditCompetition ที่ถามว่า "ใครเป็นเจ้าของ" — อันนี้ถามว่า "ตอนนี้ยังถึงเวลาไหม"
 * มีเพราะครูเข้าไปแก้รายการหลังนักเรียนลงทะเบียนไปแล้วโดยไม่ได้บอกใคร ซึ่งเดิมระบบไม่ได้ล็อกไว้เลย
 * admin ข้ามช่วงเวลาได้ตลอด (เป็นทางออกเดียวเมื่อจำเป็นต้องแก้จริง ๆ และมีร่องรอยใน audit log)
 *
 * event = null (รายการที่ยังไม่ถูกจัดเข้างาน) → ครูจัดการไม่ได้ ต้องให้ admin จัดเข้างานก่อน
 */
export function competitionManageGuard(
  actor: { role: Role },
  event: CompEditWindowEvent | null | undefined,
  now: Date = new Date()
): { allowed: boolean; message: string } {
  if (actor.role === "admin") return { allowed: true, message: "" };
  const w = competitionEditWindow(event, now);
  return {
    allowed: w.open,
    message: w.open ? "" : `${w.reason} — หากจำเป็นต้องแก้ กรุณาติดต่อผู้ดูแลระบบ`,
  };
}

/** วัน/ช่วงเวลาแข่งขันของรายการหนึ่ง — เท่าที่การตัดสิน "เปลี่ยนเวลาได้ไหม" ต้องรู้ */
export type CompSchedule = { timeSlotId: number | null; eventDate: string | null };

/**
 * เปลี่ยน "วันที่แข่ง / ช่วงเวลาแข่งขัน" ของรายการนี้ได้ไหม
 *
 * ตอนนักเรียนลงทะเบียน ระบบตรวจให้ว่าเวลาไม่ชนกับรายการอื่นที่เขาลงไว้ (กติกา 4 ของ registerEntry)
 * แต่ผลตรวจนั้นเป็นภาพ ณ วันที่ลง — พอครูมาเลื่อนเวลาทีหลัง รายชื่อที่ลงไว้แล้วไม่ได้ถูกตรวจซ้ำ
 * เวลาที่ชนกันจึงเกิดขึ้นเงียบ ๆ และไปโผล่เอาวันแข่งจริงว่านักเรียนต้องอยู่สองรายการพร้อมกัน
 * ปิดทางไว้ตั้งแต่ต้น: มีคนลงทะเบียนอยู่ = เวลาถูกล็อก (แก้ช่องอื่นได้ตามเดิม)
 *
 * นับเฉพาะรายการลงทะเบียนที่ยัง active — ที่ยกเลิกไปแล้วไม่ไปชนกับใคร ไม่งั้นรายการที่เคยมีคนลง
 * แล้วถอนออกหมดจะแก้เวลาไม่ได้ตลอดไป (การยกเลิกเป็น soft delete แถวยังอยู่)
 *
 * admin ข้ามได้เหมือนด่านเวลาอื่น ๆ — เป็นทางออกเดียวเมื่อต้องเลื่อนเวลาจริง ๆ และมีร่องรอยใน audit log
 */
export function scheduleChangeGuard(
  actor: { role: Role },
  hasActiveEntries: boolean,
  current: CompSchedule,
  next: CompSchedule
): { allowed: boolean; message: string } {
  const unchanged =
    (current.timeSlotId ?? null) === (next.timeSlotId ?? null) &&
    (current.eventDate ?? "") === (next.eventDate ?? "");
  if (unchanged || actor.role === "admin" || !hasActiveEntries) return { allowed: true, message: "" };
  return {
    allowed: false,
    message:
      "รายการนี้มีนักเรียนลงทะเบียนแล้ว จึงเปลี่ยนวันที่หรือช่วงเวลาแข่งขันไม่ได้ " +
      "(เวลาใหม่อาจไปชนกับรายการอื่นที่นักเรียนลงไว้) — หากจำเป็นต้องเลื่อนเวลา กรุณาติดต่อผู้ดูแลระบบ",
  };
}

/**
 * ตอนนี้ยกเลิกการลงทะเบียนได้ไหม — คู่กับกติกา 1 ของ registerEntry ที่คุมขา "เพิ่ม"
 *
 * ของเดิมคุมแต่ขาเพิ่ม: พอปิดรับสมัครแล้วลงเพิ่มไม่ได้จริง แต่ยัง "ลบ" ได้ทุกคน — ทั้งครูเจ้าของรายการ
 * ครูประจำชั้น และตัวนักเรียนเอง รายชื่อที่ปิดไปแล้วจึงยังหายไปได้เงียบ ๆ หลังหมดเวลา
 * (ฝั่งหน้าจอบางหน้าซ่อนปุ่มไว้แล้ว แต่ API ไม่ได้ตรวจ — ยิงตรงหรือเข้าอีกหน้าก็ลบได้อยู่ดี)
 *
 * admin ยกเลิกได้ตลอดเหมือนที่ลงทะเบียนเพิ่มได้ตลอด — เป็นคนที่ต้องตามเก็บเคสตกหล่นหลังปิดรับ
 */
export function withdrawGuard(
  actor: { role: Role },
  event: RegWindowEvent | null | undefined,
  now: Date = new Date()
): { allowed: boolean; message: string } {
  if (actor.role === "admin") return { allowed: true, message: "" };
  const w = registrationWindow(event, now);
  return {
    allowed: w.open,
    message: w.open ? "" : `${w.reason} — ยกเลิกการลงทะเบียนไม่ได้แล้ว หากจำเป็นกรุณาติดต่อผู้ดูแลระบบ`,
  };
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
