import type { NavItem } from "@/components/Nav";

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "แดชบอร์ด", icon: "dashboard" },
  { href: "/admin/years", label: "ปีการศึกษา", icon: "calendar" },
  { href: "/admin/settings", label: "ตั้งค่า", icon: "settings" },
  { href: "/admin/groups", label: "หมวดวิชา", icon: "book" },
  { href: "/admin/timeslots", label: "ช่วงเวลาแข่งขัน", icon: "clock" },
  { href: "/admin/venues", label: "สถานที่แข่งขัน", icon: "pin" },
  { href: "/admin/competitions", label: "รายการแข่งขัน", icon: "trophy" },
  { href: "/admin/students", label: "รายชื่อนักเรียน", icon: "graduation" },
  { href: "/admin/class-registrations", label: "การสมัครรายห้อง", icon: "clipboard" },
  { href: "/admin/teachers", label: "สิทธิ์ครู", icon: "user" },
  { href: "/admin/reports", label: "ออกรายงาน", icon: "file" },
  { href: "/admin/audit", label: "บันทึกการใช้งาน / Log", icon: "log" },
  { href: "/admin/backup", label: "สำรอง & กู้คืนข้อมูล", icon: "database" },
];

export const TEACHER_NAV: NavItem[] = [
  { href: "/teacher", label: "หน้าหลัก", icon: "home" },
  { href: "/teacher/competitions", label: "รายการของฉัน", icon: "trophy" },
  // ครูทุกคนบันทึกคะแนนรายการในหมวดตัวเองได้ (admin/recorder ได้ทุกรายการ)
  { href: "/teacher/scoring", label: "บันทึกผล", icon: "pencil" },
  { href: "/teacher/class-registrations", label: "การสมัครรายห้อง", icon: "graduation" },
];

export const STUDENT_NAV: NavItem[] = [
  { href: "/student", label: "แดชบอร์ด", icon: "home" },
  { href: "/student/browse", label: "การสมัคร", icon: "clipboard" },
];
