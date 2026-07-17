/**
 * ส่วนที่ใช้ร่วมทั้ง client และ server ของเกียรติบัตร — ไม่มี "server-only"
 * (แยกจาก lib/certificates.ts ที่แตะฐานข้อมูล เพื่อให้ CertEditor/CertificateCanvas ฝั่ง client import ได้)
 * ทุกพิกัด/ขนาดฟอนต์เป็น % ของหน้ากระดาษ
 */

export const BLOCK_KINDS = [
  "student_name",
  "class",
  "team_name",
  "competition_name",
  "event_name",
  "medal",
  "rank",
  "date",
  "serial",
  "qr",
  "static_text",
] as const;

export type BlockKind = (typeof BLOCK_KINDS)[number];

export const BLOCK_LABEL: Record<BlockKind, string> = {
  student_name: "ชื่อนักเรียน",
  class: "ระดับชั้น",
  team_name: "ชื่อทีม",
  competition_name: "ชื่อรายการแข่งขัน",
  event_name: "ชื่องาน",
  medal: "เหรียญรางวัล",
  rank: "อันดับ",
  date: "วันที่",
  serial: "เลขทะเบียน",
  qr: "QR ตรวจสอบ",
  static_text: "ข้อความคงที่",
};

export type CertBlock = {
  id: string;
  kind: BlockKind;
  x: number; // % — จุดอ้างอิงตาม align (left/center/right)
  y: number; // % จากขอบบน
  w: number; // % ของความกว้างหน้า
  align: "left" | "center" | "right";
  fontSize: number; // % ของความกว้างหน้า
  font: "th-serif" | "th-sans" | "th-modern";
  weight: number;
  color: string;
  text?: string; // ใช้กับ static_text; kind อื่นใช้เป็น prefix เช่น "เลขที่ "
};

export type CertLayout = CertBlock[];

export type CertRenderData = {
  studentName: string;
  className: string;
  teamName: string | null;
  competitionName: string;
  eventName: string;
  medal: "gold" | "silver" | "bronze" | "none";
  rank: number;
  serialNo: string;
  verifyToken: string;
  dateText: string;
};

/** layout เริ่มต้นของแม่แบบใหม่ — วางให้พอใช้งานได้ทันทีโดยไม่ต้องลากอะไรเลย */
export function defaultLayout(): CertLayout {
  const base = { align: "center" as const, font: "th-serif" as const, weight: 400, color: "#1f2937" };
  return [
    { id: "b1", kind: "event_name", x: 50, y: 30, w: 80, fontSize: 2.4, ...base },
    { id: "b2", kind: "student_name", x: 50, y: 44, w: 80, fontSize: 3.4, ...base, weight: 700 },
    { id: "b3", kind: "class", x: 50, y: 52, w: 60, fontSize: 1.8, ...base },
    { id: "b4", kind: "competition_name", x: 50, y: 60, w: 80, fontSize: 2.2, ...base },
    { id: "b5", kind: "medal", x: 50, y: 67, w: 60, fontSize: 1.8, ...base },
    { id: "b6", kind: "date", x: 50, y: 88, w: 60, fontSize: 1.4, ...base },
    { id: "b7", kind: "serial", x: 8, y: 93, w: 20, fontSize: 1.1, ...base, align: "left" },
    { id: "b8", kind: "qr", x: 92, y: 90, w: 7, ...base, align: "right", fontSize: 1 },
  ];
}

export function parseLayout(raw: string): CertLayout {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as CertLayout) : [];
  } catch {
    return [];
  }
}

export function formatSerial(yearBe: number, no: number): string {
  return `${yearBe}/${String(no).padStart(4, "0")}`;
}
