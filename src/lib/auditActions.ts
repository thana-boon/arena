/**
 * แคตตาล็อกของ action ใน audit log — ป้ายชื่อไทย + การจัดหมวด
 * ใช้ร่วมกันระหว่างหน้า /admin/audit (server) กับแถบตัวกรอง (client) จึงต้องไม่มี server-only
 */

export type AuditGroupKey = "competition" | "registration" | "certificate" | "master" | "system";

/** หมวดของ action — ใช้ทั้งจัดกลุ่ม dropdown และกรองทีละหมวด (ค่ากรอง = "g:<key>") */
export const AUDIT_GROUPS: { key: AuditGroupKey; label: string; actions: string[] }[] = [
  {
    key: "competition",
    label: "รายการแข่งขัน / คะแนน",
    actions: [
      "create_competition",
      "update_competition",
      "delete_competition",
      "record_scores",
      "publish",
      "unpublish",
    ],
  },
  {
    key: "registration",
    label: "การลงทะเบียน",
    actions: ["override_register", "withdraw_entry"],
  },
  {
    key: "certificate",
    label: "งาน / เกียรติบัตร",
    actions: [
      "create_cert_event",
      "update_event",
      "delete_event",
      "cert_event_status",
      "save_cert_template",
      "upload_cert_asset",
      "issue_certificates",
    ],
  },
  {
    key: "master",
    label: "ข้อมูลพื้นฐาน",
    actions: [
      "create_venue",
      "update_venue",
      "delete_venue",
      "import_venues",
      "create_time_slot",
      "update_time_slot",
      "delete_time_slot",
    ],
  },
  {
    key: "system",
    label: "ระบบ / ปีการศึกษา / สำรองข้อมูล",
    actions: [
      "create_year",
      "activate_year",
      "import_year",
      "update_settings",
      "set_teacher_role",
      "create_announcement",
      "update_announcement",
      "toggle_announcement",
      "delete_announcement",
      "backup_export",
      "backup_save_server",
      "backup_restore",
      "backup_delete_server",
    ],
  },
];

export const ACTION_LABEL: Record<string, string> = {
  create_year: "สร้างปีการศึกษา",
  activate_year: "เปิดใช้งานปีการศึกษา",
  import_year: "นำเข้าปีการศึกษา",
  update_settings: "แก้ไขการตั้งค่า",
  set_teacher_role: "ตั้งสิทธิ์ครู",

  create_announcement: "สร้างประกาศ",
  update_announcement: "แก้ไขประกาศ",
  toggle_announcement: "เปิด/ปิดประกาศ",
  delete_announcement: "ลบประกาศ",

  create_competition: "สร้างรายการแข่งขัน",
  update_competition: "แก้ไขรายการแข่งขัน",
  delete_competition: "ลบรายการแข่งขัน",
  record_scores: "บันทึกคะแนน",
  publish: "ประกาศผล",
  unpublish: "ยกเลิกประกาศผล",

  override_register: "ลงทะเบียนแบบ override",
  withdraw_entry: "ยกเลิกการลงทะเบียน",

  create_cert_event: "สร้างงาน",
  update_event: "แก้ไขงาน",
  delete_event: "ลบงาน",
  cert_event_status: "เปลี่ยนสถานะงาน",
  save_cert_template: "บันทึกแม่แบบเกียรติบัตร",
  upload_cert_asset: "อัปโหลดรูปเกียรติบัตร",
  issue_certificates: "ออกเกียรติบัตร",

  create_venue: "เพิ่มสถานที่",
  update_venue: "แก้ไขสถานที่",
  delete_venue: "ลบสถานที่",
  import_venues: "นำเข้าสถานที่",
  create_time_slot: "เพิ่มช่วงเวลา",
  update_time_slot: "แก้ไขช่วงเวลา",
  delete_time_slot: "ลบช่วงเวลา",

  backup_export: "ดาวน์โหลดไฟล์สำรอง",
  backup_save_server: "บันทึกไฟล์สำรองบนเซิร์ฟเวอร์",
  backup_restore: "กู้คืนข้อมูล",
  backup_delete_server: "ลบไฟล์สำรอง",
};

/** action ที่ลบ/ย้อนของเดิม — ย้อมป้ายสีแดงให้กวาดตาเจอง่ายเวลาไล่หาว่าใครลบอะไร */
const DESTRUCTIVE = new Set([
  "delete_competition",
  "delete_event",
  "delete_venue",
  "delete_time_slot",
  "delete_announcement",
  "withdraw_entry",
  "unpublish",
  "backup_restore",
  "backup_delete_server",
]);

const GROUP_BADGE: Record<AuditGroupKey, string> = {
  competition: "badge-purple",
  registration: "badge-info",
  certificate: "badge-gold",
  master: "badge",
  system: "badge-warning",
};

const GROUP_OF_ACTION = new Map<string, AuditGroupKey>(
  AUDIT_GROUPS.flatMap((g) => g.actions.map((a) => [a, g.key] as const))
);

export const actionLabel = (action: string): string => ACTION_LABEL[action] ?? action;

export const actionGroup = (action: string): AuditGroupKey | null =>
  GROUP_OF_ACTION.get(action) ?? null;

/** class ของป้ายชื่อ action */
export function actionBadgeClass(action: string): string {
  if (DESTRUCTIVE.has(action)) return "badge badge-error";
  const g = GROUP_OF_ACTION.get(action);
  return g ? `badge ${GROUP_BADGE[g]}` : "badge";
}

/** action ที่ป้ายชื่อไทยตรงกับคำค้น — ให้พิมพ์ "ลบ" แล้วเจอ delete_* ได้ ไม่ต้องรู้ชื่อภาษาอังกฤษ */
export function actionsMatching(q: string): string[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return Object.entries(ACTION_LABEL)
    .filter(([code, label]) => label.toLowerCase().includes(needle) || code.includes(needle))
    .map(([code]) => code);
}

// ===== รายละเอียด (คอลัมน์ detail เก็บเป็น JSON string) =====

const DETAIL_LABEL: Record<string, string> = {
  competitionId: "รายการที่",
  entryId: "การลงทะเบียนที่",
  eventId: "งานที่",
  yearId: "ปีที่",
  yearBe: "ปีการศึกษา",
  templateId: "แม่แบบที่",
  id: "รหัส",
  name: "ชื่อ",
  label: "ชื่อ",
  eventName: "งาน",
  teacherCode: "รหัสครู",
  isAdmin: "ผู้ดูแลระบบ",
  isRecorder: "ผู้บันทึกคะแนน",
  memberCodes: "สมาชิก",
  count: "จำนวน",
  new: "ออกใหม่",
  newCount: "ออกใหม่",
  total: "รวม",
  created: "เพิ่ม",
  updated: "แก้ไข",
  skipped: "ข้าม",
  locked: "ล็อกรายการ",
  adminOverride: "แก้ทั้งที่มีคนลงแล้ว",
  action: "สถานะ",
  kind: "ประเภทรูป",
  medalFilter: "กรองเหรียญ",
  bytes: "ขนาด (ไบต์)",
  size: "ขนาด (ไบต์)",
  from: "จากไฟล์",
  safety: "สำรองก่อนกู้",
};

export type DetailField = { label: string; value: string };

const fieldValue = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

/**
 * แปลง detail JSON เป็นคู่ ป้ายชื่อ/ค่า สำหรับแสดงผล
 * ถ้าไม่ใช่ JSON (ของเก่า/รูปแบบแปลก) คืนก้อนดิบไปทั้งอย่างนั้น ดีกว่าซ่อนข้อมูลทิ้ง
 */
export function parseAuditDetail(detail: string | null): DetailField[] {
  if (!detail) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(detail);
  } catch {
    return [{ label: "", value: detail }];
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [{ label: "", value: fieldValue(parsed) }];
  }
  return Object.entries(parsed as Record<string, unknown>).map(([k, v]) => ({
    label: DETAIL_LABEL[k] ?? k,
    value: fieldValue(v),
  }));
}
