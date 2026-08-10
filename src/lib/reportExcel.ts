import "server-only";
import { formatLevels, isUnlimited } from "@/lib/domain";
import { classLabel } from "@/components/report/sheetLayout";
import type { ReportBundle } from "@/lib/reportBundle";
import { capacityLabel, groupLabel, scheduleLabel, typeLabel } from "@/lib/reportLabels";
import { buildXlsx, type XlsxCell } from "@/lib/xlsx";

/**
 * ไฟล์ Excel ของ "ใบรายชื่อ" — ฉบับเดียวกับที่พิมพ์ลงกระดาษ แต่เอาไปใช้ต่อได้
 * (ครูขอมาเพื่อก็อปชื่อไปทำเอกสารอื่น เช่น ใบเซ็นชื่อ/หนังสือขออนุญาต)
 *
 * ⚠ ตั้งใจให้เป็น "ตารางแบน" หนึ่งแถวต่อหนึ่งคน ไม่ใช่หน้าตาเหมือนกระดาษ
 * เพราะจุดประสงค์คือกรอง/เรียง/ก็อปคอลัมน์ชื่อ ไม่ใช่เอาไปพิมพ์ (พิมพ์ใช้แท็บพิมพ์เหมือนเดิม)
 * ช่องที่ควรคำนวณได้ (ยอดสมัคร/จำนวนคน) จึงเขียนเป็นตัวเลขจริง ไม่ใช่ข้อความมีหน่วย
 */

const ROSTER_HEAD = [
  "ลำดับ",
  "หมวดวิชา",
  "รายการแข่งขัน",
  "ประเภท",
  "วัน–เวลา",
  "สถานที่ / ห้อง",
  "ชื่อทีม",
  "ชื่อ-สกุล",
  "ชั้น",
  "เลขที่",
  "รหัสนักเรียน",
];
const ROSTER_WIDTHS = [6, 22, 34, 14, 24, 22, 18, 28, 10, 8, 14];

const SUMMARY_HEAD = [
  "ลำดับ",
  "หมวดวิชา",
  "รายการแข่งขัน",
  "ประเภท",
  "ระดับชั้น",
  "วัน–เวลา",
  "สถานที่ / ห้อง",
  "จำนวนรับ",
  "สมัครแล้ว",
  "นักเรียน (คน)",
];
const SUMMARY_WIDTHS = [6, 22, 34, 14, 16, 24, 22, 14, 10, 12];

/**
 * สร้าง workbook สองแผ่น
 * - "รายชื่อผู้สมัคร": หนึ่งแถวต่อหนึ่งคน (รายการที่ยังไม่มีคนสมัครจะไม่มีแถว)
 * - "สรุปรายการ": หนึ่งแถวต่อหนึ่งรายการ — มีครบทุกรายการ รวมที่ยอดสมัครเป็น 0
 *   (แผ่นนี้แหละที่ตอบว่า "รายการไหนยังไม่มีใครสมัคร" ซึ่งดูจากแผ่นแรกไม่ได้)
 */
export function rosterWorkbook(bundles: ReportBundle[]): Buffer {
  const rosterRows: XlsxCell[][] = [ROSTER_HEAD];
  const summaryRows: XlsxCell[][] = [SUMMARY_HEAD];

  bundles.forEach((b, bi) => {
    const isTeam = b.meta.type === "team";
    const common = [groupLabel(b.groupName), b.meta.competitionName, typeLabel(b), scheduleLabel(b), b.venueName];

    b.roster.forEach((entry, ei) => {
      // ลำดับนับใหม่ในแต่ละรายการ ให้ตรงกับเลขบนกระดาษ — ทีมหนึ่งทีมใช้ลำดับเดียวกันทุกคน
      const seq = ei + 1;
      const team = isTeam ? entry.teamName || `ทีม ${seq}` : "";
      for (const m of entry.members) {
        rosterRows.push([seq, ...common, team, m.name, classLabel(m), m.classNumber, m.studentCode]);
      }
    });

    summaryRows.push([
      bi + 1,
      groupLabel(b.groupName),
      b.meta.competitionName,
      typeLabel(b),
      formatLevels(b.levels),
      scheduleLabel(b),
      b.venueName,
      isUnlimited(b.capacity) ? "ไม่จำกัด" : b.capacity,
      b.rosterCount,
      b.studentCount,
    ]);
  });

  return buildXlsx([
    { name: "รายชื่อผู้สมัคร", rows: rosterRows, colWidths: ROSTER_WIDTHS },
    { name: "สรุปรายการ", rows: summaryRows, colWidths: SUMMARY_WIDTHS },
  ]);
}

/** ชื่อไฟล์ที่ผู้ใช้จะได้ เช่น "รายชื่อผู้สมัคร-งานวิชาการ-2569.xlsx" */
export function rosterFileName(eventName: string, yearBe: number): string {
  // อักขระที่ Windows ห้ามใช้ในชื่อไฟล์ + ช่องว่างที่ทำให้ header เพี้ยน
  const safe = eventName.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_").trim();
  return `รายชื่อผู้สมัคร-${safe || "งาน"}-${yearBe}.xlsx`;
}

/** ค่า Content-Disposition ที่พาชื่อไฟล์ภาษาไทยผ่านเบราว์เซอร์ได้ (ASCII สำรองไว้ให้ตัวเก่า) */
export function attachmentHeader(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** ชนิดไฟล์ของ .xlsx — ยาวจนต้องมีชื่อเรียก ไม่งั้นก็อปผิดตัวเดียวคือดาวน์โหลดแล้วเปิดไม่ขึ้น */
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
