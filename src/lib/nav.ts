import type { NavItem } from "@/components/Nav";

/** กลุ่มเมนู 1 หมวด — section ว่างได้ (เช่น แดชบอร์ดเดี่ยว ๆ ไม่ต้องมีหัวข้อ) */
export type NavGroup = { section?: string; items: NavItem[] };

export const ADMIN_NAV_GROUPS: NavGroup[] = [
  { items: [{ href: "/admin", label: "แดชบอร์ด", icon: "dashboard" }] },
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
      { href: "/admin/competitions", label: "รายการแข่งขัน", icon: "trophy" },
      { href: "/admin/class-registrations", label: "การสมัครรายห้อง", icon: "clipboard" },
    ],
  },
  {
    section: "รายงาน",
    items: [
      { href: "/admin/reports", label: "ออกรายงาน", icon: "file" },
      { href: "/admin/certificates", label: "เกียรติบัตร", icon: "trophy" },
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
      { href: "/teacher", label: "หน้าหลัก", icon: "home" },
      { href: "/teacher/competitions", label: "รายการของฉัน", icon: "trophy" },
      // ครูทุกคนบันทึกคะแนนรายการในหมวดตัวเองได้ (admin/recorder ได้ทุกรายการ)
      { href: "/teacher/scoring", label: "บันทึกผล", icon: "pencil" },
      { href: "/teacher/certificates", label: "ออกเกียรติบัตร", icon: "file" },
      { href: "/teacher/class-registrations", label: "การสมัครรายห้อง", icon: "graduation" },
    ],
  },
];

export const STUDENT_NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/student", label: "แดชบอร์ด", icon: "home" },
      { href: "/student/browse", label: "การสมัคร", icon: "clipboard" },
    ],
  },
];

/** รวมทุกกลุ่มเป็นรายการเดียว (ใช้กับ BottomNav มือถือที่โชว์แบบเรียบ) */
export function flattenNav(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((g) => g.items);
}
