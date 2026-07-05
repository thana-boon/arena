import type { NavItem } from "@/components/Nav";
import type { Role } from "@/lib/auth/session";

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "แดชบอร์ด", icon: "📊" },
  { href: "/admin/years", label: "ปีการศึกษา", icon: "📅" },
  { href: "/admin/settings", label: "ตั้งค่า", icon: "⚙️" },
  { href: "/admin/groups", label: "หมวดวิชา", icon: "📚" },
  { href: "/admin/competitions", label: "รายการแข่งขัน", icon: "🏆" },
  { href: "/admin/students", label: "รายชื่อนักเรียน", icon: "🎓" },
  { href: "/admin/teachers", label: "สิทธิ์ครู", icon: "👤" },
  { href: "/admin/reports", label: "ออกรายงาน", icon: "📄" },
  { href: "/admin/audit", label: "บันทึกการใช้งาน / Log", icon: "📝" },
];

export const TEACHER_NAV: NavItem[] = [
  { href: "/teacher", label: "หน้าหลัก", icon: "🏠" },
  { href: "/teacher/competitions", label: "รายการของฉัน", icon: "🏆" },
];

export const RECORDER_EXTRA: NavItem[] = [
  { href: "/teacher/scoring", label: "บันทึกผล", icon: "✏️" },
];

export const STUDENT_NAV: NavItem[] = [
  { href: "/student", label: "แดชบอร์ด", icon: "🏠" },
  { href: "/student/browse", label: "การสมัคร", icon: "📝" },
];

export function teacherNav(role: Role): NavItem[] {
  if (role === "recorder" || role === "admin") return [...TEACHER_NAV, ...RECORDER_EXTRA];
  return TEACHER_NAV;
}
