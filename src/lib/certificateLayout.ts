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
  /** "activity" = รายการที่ไม่มีการแข่งขัน → ขึ้นว่า "เข้าร่วมกิจกรรม" และไม่มีอันดับ */
  medal: "gold" | "silver" | "bronze" | "none" | "activity";
  rank: number;
  serialNo: string;
  verifyToken: string;
  dateText: string;
};

/**
 * layout เริ่มต้นของแม่แบบใหม่ — วางให้พอใช้งานได้ทันทีโดยไม่ต้องลากอะไรเลย
 * หมายเหตุ: y เป็น % ของ "ความกว้าง" หน้า (ตาม CertificateCanvas) แนวนอนขอบล่าง ≈ 70.7
 * ค่าทั้งหมดจึงต้องอยู่ในช่วง 0–70 สำหรับกระดาษแนวนอน (ค่าเริ่มต้น) ไม่งั้นหลุดนอกหน้า
 */
export function defaultLayout(): CertLayout {
  const base = { align: "center" as const, font: "th-serif" as const, weight: 400, color: "#1f2937" };
  return [
    { id: "b1", kind: "event_name", x: 50, y: 14, w: 80, fontSize: 2.4, ...base },
    { id: "b2", kind: "student_name", x: 50, y: 28, w: 80, fontSize: 3.4, ...base, weight: 700 },
    { id: "b3", kind: "class", x: 50, y: 37, w: 60, fontSize: 1.8, ...base },
    { id: "b4", kind: "competition_name", x: 50, y: 46, w: 80, fontSize: 2.2, ...base },
    { id: "b5", kind: "medal", x: 50, y: 54, w: 60, fontSize: 1.8, ...base },
    { id: "b6", kind: "date", x: 50, y: 62, w: 60, fontSize: 1.4, ...base },
    { id: "b7", kind: "serial", x: 8, y: 67, w: 20, fontSize: 1.1, ...base, align: "left" },
    { id: "b8", kind: "qr", x: 92, y: 58, w: 7, ...base, align: "right", fontSize: 1 },
  ];
}

// ===== เรขาคณิตของหน้ากระดาษ (ใช้ร่วมกับ CertificateCanvas) =====
// ทุกพิกัด/ขนาดเป็น % ของ "ความกว้าง" หน้ากระดาษ ทั้งแกน x และ y
// ขอบล่างสุดของกระดาษจึงไม่ใช่ 100 แต่เป็น 100 × (สูง/กว้าง): แนวนอน ≈ 70.7, แนวตั้ง ≈ 141.4

export type Orientation = "landscape" | "portrait";

/** อัตราส่วน สูง/กว้าง ของ A4 ตามแนวกระดาษ */
export function pageRatio(orientation: Orientation): number {
  return orientation === "portrait" ? 297 / 210 : 210 / 297;
}

/** ค่า y สูงสุดที่ยังอยู่ในหน้ากระดาษ (หน่วยเดียวกับพิกัดทั้งหมด) */
export function pageMaxY(orientation: Orientation): number {
  return 100 * pageRatio(orientation);
}

export type Rect = { left: number; top: number; w: number; h: number };

/** กรอบจริงของบล็อกบนหน้ากระดาษ — ต้องตรงกับที่ CertificateCanvas วาง ไม่งั้นกรอบเลือกเพี้ยน */
export function blockRect(b: CertBlock, orientation: Orientation): Rect {
  if (b.kind === "qr") {
    const left = b.align === "right" ? b.x - b.w : b.align === "center" ? b.x - b.w / 2 : b.x;
    return { left, top: b.y, w: b.w, h: b.w };
  }
  const left = b.align === "center" ? b.x - b.w / 2 : b.align === "right" ? b.x - b.w : b.x;
  return { left, top: b.y, w: b.w, h: b.fontSize * 1.2 };
}

/** กรอบจริงของผู้ลงนาม (เส้น/รูป + ชื่อ + ตำแหน่ง) — ผู้ลงนามวางกึ่งกลางที่ x เสมอ */
export function sigRect(
  s: { x: number; y: number; width: number; name?: string; roleLabel?: string },
  orientation: Orientation
): Rect {
  const line = s.width * pageRatio(orientation) * 0.5;
  const nameH = s.name ? 1.2 * 1.2 + 0.5 : 0;
  const roleH = s.roleLabel ? 1 * 1.2 : 0;
  return { left: s.x - s.width / 2, top: s.y, w: s.width, h: line + nameH + roleH };
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
