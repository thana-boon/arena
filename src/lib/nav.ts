import type { NavItem } from "@/components/Nav";
import type { Role } from "@/lib/auth/session";

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "แดชบอร์ด", icon: "dashboard" },
  { href: "/admin/years", label: "ปีการศึกษา", icon: "calendar" },
  { href: "/admin/settings", label: "ตั้งค่า", icon: "settings" },
  { href: "/admin/groups", label: "หมวดวิชา", icon: "book" },
  { href: "/admin/competitions", label: "รายการแข่งขัน", icon: "trophy" },
  { href: "/admin/students", label: "รายชื่อนักเรียน", icon: "graduation" },
  { href: "/admin/teachers", label: "สิทธิ์ครู", icon: "user" },
  { href: "/admin/reports", label: "ออกรายงาน", icon: "file" },
  { href: "/admin/audit", label: "บันทึกการใช้งาน / Log", icon: "log" },
  { href: "/admin/backup", label: "สำรอง & กู้คืนข้อมูล", icon: "database" },
];

export const TEACHER_NAV: NavItem[] = [
  { href: "/teacher", label: "หน้าหลัก", icon: "home" },
  { href: "/teacher/competitions", label: "รายการของฉัน", icon: "trophy" },
];

export const RECORDER_EXTRA: NavItem[] = [
  { href: "/teacher/scoring", label: "บันทึกผล", icon: "pencil" },
];

export const STUDENT_NAV: NavItem[] = [
  { href: "/student", label: "แดชบอร์ด", icon: "home" },
  { href: "/student/browse", label: "การสมัคร", icon: "clipboard" },
];

export function teacherNav(role: Role): NavItem[] {
  if (role === "recorder" || role === "admin") return [...TEACHER_NAV, ...RECORDER_EXTRA];
  return TEACHER_NAV;
}
