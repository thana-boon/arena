/**
 * ชนิดข้อมูล + ป้ายชื่อของ "ประกาศ" ที่ใช้ร่วมกันทั้ง server และ client
 * (แยกจาก lib/announcements.ts เพราะไฟล์นั้นเป็น server-only — import เข้า client component ไม่ได้)
 */

export const ANNOUNCEMENT_LEVELS = ["info", "warning", "success"] as const;
export const ANNOUNCEMENT_AUDIENCES = ["all", "student", "teacher"] as const;

export const LEVEL_LABEL: Record<string, string> = {
  info: "ข่าวสาร",
  warning: "สำคัญ / เตือน",
  success: "ข่าวดี",
};

export const AUDIENCE_LABEL: Record<string, string> = {
  all: "ทุกคน",
  student: "เฉพาะนักเรียน",
  teacher: "เฉพาะครู",
};

/** ประกาศที่ส่งไปแสดงบนแถบ (ตัดฟิลด์ฝั่ง admin ออก) */
export type AnnouncementView = {
  id: number;
  title: string;
  body: string;
  level: string;
  dismissible: boolean;
  /** กุญแจ "เคยกดปิดแล้ว" = id + เวลาแก้ไข → admin แก้ข้อความเมื่อไหร่ แถบกลับมาแสดงใหม่ทุกคน */
  key: string;
};

/**
 * ===== การจำว่า "ใครกดปิดประกาศไหนไปแล้ว" =====
 * เก็บใน cookie ไม่ใช่ localStorage เพราะ "เซิร์ฟเวอร์ต้องรู้ตั้งแต่ตอน render"
 * ไม่งั้นแถบจะโผล่หลังหน้าโหลดเสร็จแล้วดันเนื้อหาลง (สะดุดตามากบนมือถือ ซึ่งเป็นผู้ใช้ส่วนใหญ่)
 * ไม่ต้องเก็บลง DB — เป็นความชอบระดับเครื่อง ไม่ใช่ข้อมูลของระบบ
 */
export const DISMISS_COOKIE = "arena_ann_seen";
/** จำนวนกุญแจที่เก็บใน cookie — cookie ถูกส่งไปกับทุก request จึงต้องมีเพดาน */
export const DISMISS_MAX = 20;

export const parseDismissed = (raw: string | undefined): string[] =>
  raw ? raw.split(".").filter(Boolean) : [];

export const serializeDismissed = (keys: string[]): string =>
  keys.slice(-DISMISS_MAX).join(".");
