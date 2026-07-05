// ===== helper กลาง (ใช้ได้ทั้ง client/server) =====

export const CLASS_LEVELS = [
  "อ.1", "อ.2", "อ.3",
  "ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6",
  "ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6",
] as const;
export type ClassLevel = (typeof CLASS_LEVELS)[number];

export type Medal = "gold" | "silver" | "bronze" | "none";

export const MEDAL_LABEL: Record<Medal, string> = {
  gold: "เหรียญทอง",
  silver: "เหรียญเงิน",
  bronze: "เหรียญทองแดง",
  none: "เข้าร่วม",
};

export const MEDAL_BADGE_CLASS: Record<Medal, string> = {
  gold: "badge-gold",
  silver: "badge-purple",
  bronze: "badge-warning",
  none: "badge",
};

/** parse json array จาก LONGTEXT อย่างปลอดภัย */
export function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** คำนวณเปอร์เซ็นต์คะแนน */
export function scorePercent(total: number, fullScore: number): number {
  if (fullScore <= 0) return 0;
  return (total / fullScore) * 100;
}

/** ตัดสินเหรียญจาก % ตามเกณฑ์ */
export function decideMedal(
  pct: number,
  goldPct: number,
  silverPct: number,
  bronzePct: number
): Medal {
  if (pct >= goldPct) return "gold";
  if (pct >= silverPct) return "silver";
  if (pct >= bronzePct) return "bronze";
  return "none";
}

/**
 * จัดอันดับตามคะแนนรวมมาก→น้อย คะแนนเท่ากัน = อันดับเดียวกัน (1,1,3)
 * รับ array ที่ sort แล้ว (มากไปน้อย) คืน array อันดับคู่ขนาน
 */
export function computeRanks(sortedTotals: number[]): number[] {
  const ranks: number[] = [];
  let lastScore: number | null = null;
  let lastRank = 0;
  sortedTotals.forEach((score, i) => {
    if (lastScore === null || score !== lastScore) {
      lastRank = i + 1;
      lastScore = score;
    }
    ranks.push(lastRank);
  });
  return ranks;
}

// ===== วันที่แบบไทย (พุทธศักราช) =====
const TH_MONTHS_ABBR = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/**
 * แปลงวันที่ (ISO เช่น "2026-08-15" หรือ Date) เป็นข้อความไทยแบบ พ.ศ.
 * เช่น "15 ส.ค. 2569" — คืน "" ถ้า input ว่าง/ไม่ถูกต้อง
 */
export function formatThaiDate(input: string | Date | null | undefined): string {
  if (!input) return "";
  let y: number, m: number, d: number;
  if (typeof input === "string") {
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      y = Number(match[1]); m = Number(match[2]); d = Number(match[3]);
    } else {
      const dt = new Date(input);
      if (isNaN(dt.getTime())) return input;
      y = dt.getFullYear(); m = dt.getMonth() + 1; d = dt.getDate();
    }
  } else {
    if (isNaN(input.getTime())) return "";
    y = input.getFullYear(); m = input.getMonth() + 1; d = input.getDate();
  }
  const month = TH_MONTHS_ABBR[m - 1];
  if (!month) return typeof input === "string" ? input : "";
  return `${d} ${month} ${y + 543}`;
}

export type CompType = "individual" | "team";

export const ROLE_HOME: Record<string, string> = {
  student: "/student",
  teacher: "/teacher",
  recorder: "/teacher",
  admin: "/admin",
};
