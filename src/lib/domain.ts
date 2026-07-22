// ===== helper กลาง (ใช้ได้ทั้ง client/server) =====

export const CLASS_LEVELS = [
  "เตรียมอนุบาล",
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

/**
 * ป้ายรางวัลตามอันดับ (ใช้บนเกียรติบัตร) — อันดับ 1-3 เป็นชื่อรางวัล, อันดับอื่นใช้ "อันดับที่ N"
 * 1 = ชนะเลิศ · 2 = รองชนะเลิศอันดับ 1 · 3 = รองชนะเลิศอันดับ 2
 */
export function rankAwardLabel(rank: number): string {
  if (rank === 1) return "ชนะเลิศ";
  if (rank === 2) return "รองชนะเลิศอันดับ 1";
  if (rank === 3) return "รองชนะเลิศอันดับ 2";
  return rank > 0 ? `อันดับที่ ${rank}` : "";
}

/** parse json array จากคอลัมน์ text อย่างปลอดภัย */
export function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * ปรับคะแนนเต็มของแต่ละเกณฑ์ให้รวมกันเป็น 100 พอดี โดยคงสัดส่วนเดิม
 * คืนจำนวนเต็ม การันตีทุกข้อ ≥ 1 และผลรวม = 100 เสมอ (ถ้ามีเกณฑ์ ≤ 100 ข้อ)
 * เช่น [30,30,30] → [33,33,34] ; [40,40,40] → [33,33,34] ; [1,1] → [50,50]
 */
export function scaleMaxScoresTo100(maxScores: number[]): number[] {
  const n = maxScores.length;
  if (n === 0) return [];
  const sum = maxScores.reduce((a, b) => a + b, 0);
  // ผลรวมเดิม ≤ 0 (ไม่ควรเกิด) → เฉลี่ยเท่ากันทุกข้อ
  const raw = sum > 0 ? maxScores.map((v) => (v * 100) / sum) : maxScores.map(() => 100 / n);
  const out = raw.map((v) => Math.max(1, Math.floor(v)));
  let diff = 100 - out.reduce((a, b) => a + b, 0);
  // เหลือ → แจกให้ข้อที่เศษทศนิยมมากสุดก่อน
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; diff > 0; k++, diff--) out[order[k % n].i]++;
  // เกิน (เพราะดันขั้นต่ำเป็น 1) → ค่อย ๆ ลดจากข้อที่มากสุด (คงขั้นต่ำ 1)
  while (diff < 0) {
    let maxI = 0;
    for (let j = 1; j < n; j++) if (out[j] > out[maxI]) maxI = j;
    if (out[maxI] <= 1) break;
    out[maxI]--; diff++;
  }
  return out;
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

// ===== ความจุ / ที่นั่ง =====
/** ค่า capacity ที่ถือว่า "ไม่จำกัดจำนวน" (เป็นค่า default ตอนสร้างรายการ) */
export const UNLIMITED_CAPACITY = -1;

/** true = ที่นั่งไม่จำกัดจำนวน */
export function isUnlimited(capacity: number | null | undefined): boolean {
  return capacity != null && capacity < 0;
}

/** ที่นั่งเต็มหรือยัง (ไม่จำกัด = ไม่มีวันเต็ม) */
export function seatsFull(registered: number, capacity: number | null | undefined): boolean {
  return !isUnlimited(capacity) && registered >= (capacity ?? 0);
}

/** ข้อความแสดงจำนวนรับ เช่น "12/40" หรือ "12/ไม่จำกัด" */
export function formatSeats(registered: number, capacity: number | null | undefined): string {
  return `${registered}/${isUnlimited(capacity) ? "ไม่จำกัด" : capacity ?? 0}`;
}

/**
 * ย่อรายการระดับชั้นเป็นช่วง เช่น ["ป.4","ป.5","ป.6","ม.1"] → "ป.4–ป.6, ม.1"
 * (ยุบเฉพาะชั้นที่ติดกันตามลำดับ CLASS_LEVELS) — ใช้ในรายงานสรุปให้อ่านง่าย
 */
export function formatLevels(levels: string[]): string {
  const idx = (lv: string) => CLASS_LEVELS.indexOf(lv as ClassLevel);
  const sorted = [...levels].filter((lv) => idx(lv) >= 0).sort((a, b) => idx(a) - idx(b));
  const unknown = levels.filter((lv) => idx(lv) < 0);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && idx(sorted[j + 1]) === idx(sorted[j]) + 1) j++;
    parts.push(j - i >= 2 ? `${sorted[i]}–${sorted[j]}` : sorted.slice(i, j + 1).join(", "));
    i = j + 1;
  }
  return [...parts, ...unknown].join(", ");
}

// ===== ช่วงเวลา (time slot) =====
/** "09:00:00" → "09:00" (ตัดวินาที) */
export function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

/** ข้อความช่วงเวลา เช่น "ช่วงเช้า (09:00–12:00)" */
export function formatSlot(label: string, startTime: string, endTime: string): string {
  return `${label} (${hhmm(startTime)}–${hhmm(endTime)})`;
}

export type CompType = "individual" | "team";

/** นักเรียน 1 คน + รายการที่สมัครไว้ (หน้า "การสมัครรายห้อง") */
export type RoomStudent = {
  studentCode: string;
  name: string;
  classLevel: string;
  classRoom: string;
  registrations: {
    entryId: number;
    competitionId: number;
    competitionName: string;
    groupName: string;
    teamName: string | null;
    eventDate: string | null;
    eventId: number | null; // งาน (Event) ที่รายการนี้สังกัด — ใช้กรองหน้า "การสมัครรายห้อง"
  }[];
};

/** รายการแข่งขันที่เปิดรับระดับชั้นของห้อง — ให้ครู/แอดมินกดสมัครแทนนักเรียนจากหน้า "การสมัครรายห้อง" */
export type RoomComp = {
  id: number;
  name: string;
  type: CompType;
  eventId: number | null;
  eventName: string;
  groupName: string;
  levels: string[]; // ระดับชั้นที่รายการรับ — ใช้จำกัด StudentPicker ตอนเพิ่มสมาชิกทีม
  teamSizeMin: number | null;
  teamSizeMax: number | null;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  capacity: number; // < 0 = ไม่จำกัด
  registered: number;
  open: boolean; // งานเปิดรับสมัครและอยู่ในช่วงเวลา (admin override ข้ามได้)
};

/** สถิติการสมัครของห้องหนึ่ง (ภาพรวมทุกห้องของ admin) — สมัคร ≥ 1 รายการ = นับว่าสมัครแล้ว */
export type RoomOverviewRow = {
  classLevel: string;
  classRoom: string;
  total: number;
  registered: number;
};

export const ROLE_HOME: Record<string, string> = {
  student: "/student",
  teacher: "/teacher",
  recorder: "/teacher",
  admin: "/admin",
};
