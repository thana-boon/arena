import type { NavItem } from "@/components/Nav";

/** กลุ่มเมนู 1 หมวด — section ว่างได้ (เช่น แดชบอร์ดเดี่ยว ๆ ไม่ต้องมีหัวข้อ) */
export type NavGroup = { section?: string; items: NavItem[] };

export const ADMIN_NAV_GROUPS: NavGroup[] = [
  { items: [{ href: "/admin", label: "แดชบอร์ด", icon: "dashboard", primary: true }] },
  {
    section: "กำหนดข้อมูล",
    items: [
      { href: "/admin/years", label: "ปีการศึกษา", icon: "calendar" },
      { href: "/admin/settings", label: "ตั้งค่า", icon: "settings" },
      { href: "/admin/groups", label: "หมวดวิชา", icon: "book" },
      { href: "/admin/timeslots", label: "ช่วงเวลาแข่งขัน", icon: "clock" },
      { href: "/admin/venues", label: "สถานที่แข่งขัน", icon: "pin" },
      { href: "/admin/students", label: "รายชื่อนักเรียน", icon: "graduation" },
      { href: "/admin/teachers", label: "สิทธิ์ครู", icon: "user" },
    ],
  },
  {
    section: "การแข่งขัน",
    items: [
      { href: "/admin/competitions", label: "รายการแข่งขัน", icon: "trophy", short: "รายการ", primary: true },
      { href: "/admin/class-registrations", label: "การสมัครรายห้อง", icon: "clipboard", short: "รายห้อง", primary: true },
      { href: "/admin/results", label: "ประกาศผล", icon: "chart" },
    ],
  },
  {
    section: "รายงาน",
    items: [
      { href: "/admin/reports", label: "ออกรายงาน", icon: "file", short: "รายงาน", primary: true },
      { href: "/admin/certificates", label: "ออกแบบเกียรติบัตร", icon: "trophy" },
      // สองอันล่างอยู่นอก /admin/certificates โดยตั้งใจ — Nav ไฮไลต์ด้วย startsWith(href + "/")
      // ถ้าเป็น path ลูก เมนู "ออกแบบเกียรติบัตร" จะสว่างพร้อมกันทั้งคู่
      { href: "/admin/cert-issue", label: "ออกเกียรติบัตร", icon: "printer" },
      { href: "/admin/cert-registry", label: "ทะเบียนเกียรติบัตร", icon: "search" },
    ],
  },
  {
    section: "ระบบ",
    items: [
      { href: "/admin/audit", label: "บันทึกการใช้งาน", icon: "log" },
      { href: "/admin/backup", label: "สำรองข้อมูล", icon: "database" },
    ],
  },
];

export const TEACHER_NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/teacher", label: "หน้าหลัก", icon: "home", primary: true },
      { href: "/teacher/competitions", label: "รายการของฉัน", icon: "trophy", short: "รายการ", primary: true },
      // ครูประจำชั้นใช้บ่อยที่สุด (ลงสมัครแทนนักเรียนในห้องตัวเอง) — ต้องอยู่ติดกับ "รายการ" บนแถบล่าง
      // เรียงให้ตรงกับเมนูฝั่ง admin (รายการแข่งขัน → การสมัครรายห้อง) จะได้ไม่สลับที่กันคนละมุม
      { href: "/teacher/class-registrations", label: "การสมัครรายห้อง", icon: "graduation", short: "ห้องของฉัน", primary: true },
      // ครูทุกคนบันทึกคะแนนรายการในหมวดตัวเองได้ (admin/recorder ได้ทุกรายการ)
      { href: "/teacher/scoring", label: "บันทึกผล", icon: "pencil", primary: true },
      // ภาพรวม "ประกาศแล้ว/ยังไม่ประกาศ" ของทั้งหมวด — งานหลังบันทึกคะแนนเสร็จ จึงอยู่ถัดจาก "บันทึกผล"
      { href: "/teacher/results", label: "ประกาศผล", icon: "chart" },
      // เอกสารของทั้งหมวด (ใบรายชื่อ/ใบกรอกคะแนน/ใบประกาศผล) — หน้าเดียวกับ /admin/reports แต่กรองตามสิทธิ์
      { href: "/teacher/reports", label: "ออกรายงาน", icon: "printer", short: "รายงาน" },
      { href: "/teacher/certificates", label: "เกียรติบัตร", icon: "file" },
      { href: "/teacher/cert-registry", label: "ทะเบียนเกียรติบัตร", icon: "search", short: "ทะเบียน" },
    ],
  },
];

export const STUDENT_NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/student", label: "แดชบอร์ด", icon: "home", primary: true },
      { href: "/student/browse", label: "การสมัคร", icon: "clipboard", primary: true },
      { href: "/student/certificates", label: "เกียรติบัตรของฉัน", icon: "trophy", short: "เกียรติบัตร", primary: true },
    ],
  },
];

/** รวมทุกกลุ่มเป็นรายการเดียว (ใช้กับแถบล่างมือถือที่โชว์แบบเรียบ) */
export function flattenNav(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((g) => g.items);
}

/** จำนวนเมนูสูงสุดที่แถบล่างวางเรียงได้โดยยังกดถูก (มากกว่านี้ต้องมีปุ่ม "เมนู") */
export const BOTTOM_NAV_SLOTS = 5;

/**
 * เมนูที่จะขึ้นแถบล่างบนมือถือ
 * - เมนูน้อย (≤ 5) → โชว์ทั้งหมด ไม่ต้องมีปุ่มเมนู
 * - เมนูเยอะ → เอาเฉพาะที่ทำเครื่องหมาย primary ไว้ (ไม่เกิน 4) ที่เหลือไปอยู่ในแผ่นเมนู
 */
export function bottomNavItems(groups: NavGroup[]): { items: NavItem[]; hasMore: boolean } {
  const all = flattenNav(groups);
  if (all.length <= BOTTOM_NAV_SLOTS) return { items: all, hasMore: false };
  const primary = all.filter((i) => i.primary);
  return { items: (primary.length ? primary : all).slice(0, BOTTOM_NAV_SLOTS - 1), hasMore: true };
}
