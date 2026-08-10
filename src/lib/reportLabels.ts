import { formatThaiDate, hhmm, isUnlimited } from "@/lib/domain";
import type { ReportBundle } from "@/lib/reportBundle";

/**
 * ข้อความสั้น ๆ ที่บรรยายรายการแข่งขันหนึ่งรายการ (ประเภท / จำนวนรับ / วัน–เวลา)
 *
 * แยกออกมาจาก ReportSheets เพราะไฟล์ Excel ต้องใช้ข้อความชุดเดียวกับกระดาษ
 * — เอกสารเดียวกันคนละรูปแบบ ต้องอ่านแล้วได้ความหมายตรงกัน
 * (ไฟล์นี้ต้อง "บริสุทธิ์" ห้าม import อะไรที่เป็น server-only เพราะ ReportSheets ถูกใช้ในฝั่ง client ด้วย)
 */

/** ป้ายประเภท เช่น "เดี่ยว" / "ทีม 2–5 คน" — รายการที่ไม่มีการแข่งขันบอกไว้ให้ชัด */
export function typeLabel(b: ReportBundle): string {
  if (b.noContest) return b.meta.type === "team" ? "ทีม (ไม่มีการแข่งขัน)" : "ไม่มีการแข่งขัน";
  if (b.meta.type !== "team") return "เดี่ยว";
  const { teamSizeMin: mn, teamSizeMax: mx } = b;
  if (mn && mx) return mn === mx ? `ทีม ${mn} คน` : `ทีม ${mn}–${mx} คน`;
  if (mn) return `ทีม ≥${mn} คน`;
  if (mx) return `ทีม ≤${mx} คน`;
  return "ทีม";
}

/** ข้อความจำนวนรับ — ไม่จำกัด → "ไม่จำกัดจำนวน" */
export function capacityLabel(b: ReportBundle): string {
  if (isUnlimited(b.capacity)) return "ไม่จำกัดจำนวน";
  return `${b.capacity} ${b.meta.type === "team" ? "ทีม" : "คน"}`;
}

/** วัน–เวลาแข่งขันแบบบรรทัดเดียว เช่น "12 ส.ค. 2569 09:00–12:00 น." — ไม่มีข้อมูลเลยคืน "" */
export function scheduleLabel(b: ReportBundle): string {
  const date = formatThaiDate(b.meta.eventDate);
  const time = b.meta.startTime ? `${hhmm(b.meta.startTime)}–${hhmm(b.meta.endTime)} น.` : "";
  return [date, time].filter(Boolean).join(" ");
}

/** ชื่อหมวดที่พร้อมแสดงผล — รายการที่ไม่ได้ผูกหมวดไว้เก็บเป็น "-" ในข้อมูล */
export function groupLabel(groupName: string): string {
  return groupName === "-" ? "ไม่ระบุหมวด" : groupName;
}
