// ===== helper กลาง (ใช้ได้ทั้ง client/server) =====

export const CLASS_LEVELS = [
  "เตรียมอนุบาล",
  "อ.1", "อ.2", "อ.3",
  "ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6",
  "ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6",
] as const;
export type ClassLevel = (typeof CLASS_LEVELS)[number];

/** ลำดับของชั้นตาม CLASS_LEVELS (เตรียมอนุบาล → อ. → ป. → ม.) — ชั้นที่ไม่รู้จักไปท้ายสุด */
export function classLevelIndex(level: string): number {
  const i = (CLASS_LEVELS as readonly string[]).indexOf(level);
  return i === -1 ? 999 : i;
}

/** ชั้นต่ำสุดของรายการ (รายการหนึ่งรับได้หลายชั้น) — ใช้เรียงรายการเป็น เตรียม → อ → ป → ม */
export function minClassLevelIndex(levels: string[]): number {
  return levels.reduce((min, lv) => Math.min(min, classLevelIndex(lv)), 999);
}

/**
 * ช่วงชั้นสำหรับสรุปยอด — เรียงตาม CLASS_LEVELS
 * "other" ไว้รับชั้นที่อ่านไม่ออก/ไม่ระบุ เพื่อให้ยอดแยกช่วงบวกกันได้เท่ายอดรวมเสมอ
 */
export const CLASS_BANDS = [
  { key: "pre", label: "เตรียมอนุบาล" },
  { key: "kg", label: "อนุบาล" },
  { key: "primary", label: "ประถมศึกษา" },
  { key: "secondary", label: "มัธยมศึกษา" },
  { key: "other", label: "ไม่ระบุชั้น" },
] as const;
export type ClassBand = (typeof CLASS_BANDS)[number]["key"];

/** "ม.4" → "secondary" — ใช้จัดยอดผู้สมัครแยกช่วงชั้น */
export function classBand(level: string | null | undefined): ClassBand {
  const lv = (level ?? "").trim();
  if (lv.startsWith("เตรียม")) return "pre";
  if (lv.startsWith("อ.") || lv.startsWith("อนุบาล")) return "kg";
  if (lv.startsWith("ป.")) return "primary";
  if (lv.startsWith("ม.")) return "secondary";
  return "other";
}

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
 * ค่าที่เก็บใน certificate_issues.medal ได้
 * "activity" = รายการที่ไม่มีการแข่งขัน (competitions.no_contest) — ไม่ใช่ผลของการตัดสิน
 * จึงแยกจาก Medal ไม่ให้ decideMedal/การจัดอันดับต้องรู้จักค่านี้
 */
export type CertAward = Medal | "activity";

export const AWARD_LABEL: Record<CertAward, string> = {
  ...MEDAL_LABEL,
  activity: "เข้าร่วมกิจกรรม",
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

/**
 * % ความคืบหน้าแบบไม่หลอกตา — ปัดลงเสมอ จึงขึ้น 100% ต่อเมื่อทำครบจริง
 * (99.6% ปัดขึ้นเป็น 100% จะทำให้คนเข้าใจว่าประกาศครบแล้วทั้งที่ยังเหลือรายการค้าง)
 */
export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.floor((Math.min(done, total) / total) * 100);
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

/**
 * วัน-เวลาแบบไทย เช่น "15 ส.ค. 2569 16:30 น." — ใช้บอกกำหนดเปิด/ปิดรับสมัคร (เวลามีความหมาย)
 * แปลงเป็น Date ก่อนเสมอ เวลาที่เห็นจึงเป็นเวลาเครื่อง (คอนเทนเนอร์ตั้ง TZ=Asia/Bangkok)
 */
export function formatThaiDateTime(input: string | Date | null | undefined): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return typeof input === "string" ? input : "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatThaiDate(d)} ${hh}:${mm} น.`;
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

// ===== ช่วงเวลาระดับงาน (สวิตช์ + ช่วงวัน-เวลา) =====
// งานหนึ่งมีหลายช่วงที่คุมคนละเรื่อง (รับสมัครนักเรียน / ให้ครูสร้าง-แก้รายการ) แต่กติกาเหมือนกันเป๊ะ
// จึงคิดที่เดียวแล้วเปลี่ยนแค่ข้อความ — ไม่งั้นแก้กติกาที่หนึ่งแล้วลืมอีกที่ เหมือนที่เคยเกิดตอนช่วงรับสมัคร

/** ช่วงเวลาแบบดิบ ๆ ที่ตัดสินได้ว่า "ตอนนี้เปิดไหม" */
type Window = { enabled: boolean; start: string | Date | null; end: string | Date | null };

/** ข้อความประจำแต่ละช่วง — ทำให้เหตุผลที่ผู้ใช้เห็นตรงกันทุกหน้าที่ถามเรื่องเดียวกัน */
type WindowTexts = {
  missing: string; // ไม่มีงานผูกอยู่
  off: string; // ปิดสวิตช์ไว้
  before: string; // ยังไม่ถึงเวลาเปิด
  after: string; // เลยเวลาปิดแล้ว
  noEvents: string; // ไม่มีงานให้พิจารณาเลยสักงาน (ใช้กับแถบสรุป)
  openTitle: string; // พาดหัวตอนเปิดอยู่
  deadline: (name: string, at: string) => string; // เปิดอยู่ + มีกำหนดปิด
  upcoming: (name: string, at: string) => string; // จะเปิดรอบหน้า
  ended: (name: string, at: string) => string; // ปิดไปแล้วเมื่อไหร่
};

function evalWindow(
  w: Window | null | undefined,
  t: WindowTexts,
  now: Date
): { open: boolean; reason: string | null } {
  if (!w) return { open: false, reason: t.missing };
  if (!w.enabled) return { open: false, reason: t.off };
  if (w.start && now < new Date(w.start)) return { open: false, reason: t.before };
  if (w.end && now > new Date(w.end)) return { open: false, reason: t.after };
  return { open: true, reason: null };
}

export type WindowNotice = {
  open: boolean;
  /** พาดหัวสั้น เช่น "หมดเวลารับสมัครแล้ว" */
  title: string;
  /** บรรทัดขยายความ (ชื่องาน + วันเวลา) — "" ถ้าไม่มีกำหนดเวลาให้บอก */
  detail: string;
};

/**
 * สรุปสถานะของกลุ่มงาน ให้เป็นข้อความเดียวที่ขึ้นหัวหน้าจอได้
 * ครูสะท้อนว่าเดิมต้องกดเข้าไปเลือกรายการก่อนถึงจะรู้ว่าหมดเวลาแล้ว — ต้องรู้ตั้งแต่เปิดหน้า
 *
 * ลำดับความสำคัญตอนไม่มีงานเปิดอยู่: งานที่กำลังจะเปิด > งานที่เพิ่งหมดเวลา > ปิดสวิตช์เฉย ๆ
 * (วันเปิดรอบหน้าเป็นข้อมูลที่เอาไปใช้ต่อได้มากกว่าวันที่ปิดไปแล้ว)
 */
function buildNotice(items: (Window & { name: string })[], t: WindowTexts, now: Date): WindowNotice {
  const ms = (v: string | Date) => new Date(v).getTime();
  const open = items.filter((e) => evalWindow(e, t, now).open);
  if (open.length) {
    const deadlines = open
      .filter((e) => e.end)
      .sort((a, b) => ms(a.end!) - ms(b.end!))
      .map((e) => t.deadline(e.name, formatThaiDateTime(e.end)));
    return { open: true, title: t.openTitle, detail: deadlines.join(" · ") };
  }
  if (!items.length) return { open: false, title: t.noEvents, detail: "" };

  // จะเปิดรอบหน้า — เอางานที่ใกล้ที่สุด (สวิตช์ต้องเปิดไว้แล้ว ไม่งั้นวันเปิดยังไม่มีความหมาย)
  const upcoming = items
    .filter((e) => e.enabled && e.start && now < new Date(e.start))
    .sort((a, b) => ms(a.start!) - ms(b.start!));
  if (upcoming.length)
    return { open: false, title: t.before, detail: t.upcoming(upcoming[0].name, formatThaiDateTime(upcoming[0].start)) };

  // หมดเวลาไปแล้ว — เอางานที่ปิดล่าสุด (ใกล้ปัจจุบันที่สุด) เป็นตัวแทน
  const ended = items
    .filter((e) => e.end && now > new Date(e.end))
    .sort((a, b) => ms(b.end!) - ms(a.end!));
  if (ended.length)
    return { open: false, title: t.after, detail: t.ended(ended[0].name, formatThaiDateTime(ended[0].end)) };

  return { open: false, title: t.off, detail: "" };
}

// ===== ช่วงรับสมัคร (ระดับงาน) =====
/** เท่าที่ต้องรู้เพื่อตัดสินว่างานยังรับสมัครอยู่ไหม (รับได้ทั้งแถว events และข้อมูลที่ส่งให้ client) */
export type RegWindowEvent = {
  registrationOpen: boolean;
  regStart: string | Date | null;
  regEnd: string | Date | null;
};

const REG_TEXTS: WindowTexts = {
  missing: "รายการนี้ยังไม่ถูกจัดเข้างาน",
  off: "ขณะนี้ปิดรับสมัคร",
  before: "ยังไม่ถึงเวลาเปิดรับสมัคร",
  after: "หมดเวลารับสมัครแล้ว",
  noEvents: "ยังไม่มีงานที่เปิดรับสมัคร",
  openTitle: "เปิดรับสมัคร",
  deadline: (n, at) => `${n} — ปิดรับ ${at}`,
  upcoming: (n, at) => `${n} — เปิดรับ ${at}`,
  ended: (n, at) => `${n} — ปิดรับเมื่อ ${at}`,
};

const regWin = (e: RegWindowEvent): Window => ({
  enabled: e.registrationOpen,
  start: e.regStart,
  end: e.regEnd,
});

/**
 * งานนี้ยังรับสมัครอยู่ไหม + ถ้าไม่ เพราะอะไร
 * ใช้ที่เดียวกันทั้งฝั่งบันทึก (registerEntry), ฝั่งลิสต์ (การสมัครรายห้อง) และฝั่งแสดงผล
 * — เดิมเงื่อนไขเดียวกันนี้ถูกเขียนซ้ำสามที่ ข้อความบอกเหตุผลจึงหลุดไม่ตรงกันได้ง่าย
 */
export function registrationWindow(
  event: RegWindowEvent | null | undefined,
  now: Date = new Date()
): { open: boolean; reason: string | null } {
  return evalWindow(event ? regWin(event) : null, REG_TEXTS, now);
}

/** งาน + ชื่อ — ใช้ทำข้อความบอกสถานะรับสมัครที่อ้างถึงงานได้ */
export type NamedRegWindowEvent = RegWindowEvent & { name: string };

export type RegNotice = WindowNotice;

/** สรุปสถานะรับสมัครของกลุ่มงาน เป็นข้อความเดียวที่ขึ้นหัวหน้าจอได้ */
export function registrationNotice(events: NamedRegWindowEvent[], now: Date = new Date()): RegNotice {
  return buildNotice(events.map((e) => ({ ...regWin(e), name: e.name })), REG_TEXTS, now);
}

// ===== ช่วงสร้าง/แก้ไขรายการแข่งขัน (ระดับงาน) =====
// คนละเรื่องกับช่วงรับสมัคร: อันนั้นคุมนักเรียน อันนี้คุมครู
// เจอมาแล้วว่าครูเข้าไปแก้รายการตอนนักเรียนลงทะเบียนไปแล้ว โดยไม่ได้บอกใคร — นอกช่วงนี้เหลือแต่ admin ที่แก้ได้
/** เท่าที่ต้องรู้ว่างานนี้ยังให้ครูจัดการรายการแข่งขันอยู่ไหม */
export type CompEditWindowEvent = {
  compEditOpen: boolean;
  compEditStart: string | Date | null;
  compEditEnd: string | Date | null;
};

const COMP_EDIT_TEXTS: WindowTexts = {
  missing: "รายการนี้ยังไม่ถูกจัดเข้างาน",
  off: "ขณะนี้ปิดการสร้าง/แก้ไขรายการแข่งขัน",
  before: "ยังไม่ถึงเวลาเปิดให้สร้าง/แก้ไขรายการแข่งขัน",
  after: "หมดเวลาสร้าง/แก้ไขรายการแข่งขันแล้ว",
  noEvents: "ยังไม่มีงานที่เปิดให้สร้าง/แก้ไขรายการแข่งขัน",
  openTitle: "เปิดให้สร้าง/แก้ไขรายการแข่งขัน",
  deadline: (n, at) => `${n} — แก้ไขได้ถึง ${at}`,
  upcoming: (n, at) => `${n} — เปิดให้แก้ไข ${at}`,
  ended: (n, at) => `${n} — ปิดแก้ไขเมื่อ ${at}`,
};

const compEditWin = (e: CompEditWindowEvent): Window => ({
  enabled: e.compEditOpen,
  start: e.compEditStart,
  end: e.compEditEnd,
});

/** งานนี้ยังให้ครูสร้าง/แก้ไข/ลบรายการแข่งขันอยู่ไหม + ถ้าไม่ เพราะอะไร (admin ไม่ต้องผ่านด่านนี้) */
export function competitionEditWindow(
  event: CompEditWindowEvent | null | undefined,
  now: Date = new Date()
): { open: boolean; reason: string | null } {
  return evalWindow(event ? compEditWin(event) : null, COMP_EDIT_TEXTS, now);
}

/** งาน + ชื่อ — ใช้ทำข้อความบอกสถานะช่วงแก้ไขที่อ้างถึงงานได้ */
export type NamedCompEditWindowEvent = CompEditWindowEvent & { name: string };

/** สรุปสถานะช่วงแก้ไขรายการของกลุ่มงาน เป็นข้อความเดียวที่ขึ้นหัวหน้าจอครูได้ */
export function competitionEditNotice(
  events: NamedCompEditWindowEvent[],
  now: Date = new Date()
): WindowNotice {
  return buildNotice(events.map((e) => ({ ...compEditWin(e), name: e.name })), COMP_EDIT_TEXTS, now);
}

export type CompType = "individual" | "team";

// ===== ช่วงเปลี่ยนตัวผู้เข้าแข่งขัน (ระดับงาน) =====
// ต่างจากอีกสองช่วงตรงที่สวิตช์มีสองตัว แยกตามประเภทของ "รายการ" ที่กำลังถามถึง
// (ทีมมักเปิดให้เปลี่ยน — สมาชิกป่วยแล้วแข่งไม่ครบ ; เดี่ยวคือคัดตัวมาแล้ว มักปิดไว้)
// ช่วงวัน-เวลาใช้ร่วมกันทั้งสองประเภท — เว้นว่าง = ไม่จำกัดช่วงเวลา
/** เท่าที่ต้องรู้ว่างานนี้ยังให้เปลี่ยนตัวอยู่ไหม */
export type SubWindowEvent = {
  subOpenIndividual: boolean;
  subOpenTeam: boolean;
  subStart: string | Date | null;
  subEnd: string | Date | null;
};

const typeWord = (type: CompType) => (type === "team" ? "ประเภททีม" : "ประเภทเดี่ยว");

/** ข้อความของช่วงเปลี่ยนตัว — บอกประเภทไปด้วย เพราะเปิดทีมแต่ปิดเดี่ยวได้ ถ้าไม่บอกครูจะงงว่าทำไมบางรายการเปลี่ยนได้ */
const subTexts = (type: CompType): WindowTexts => ({
  missing: "รายการนี้ยังไม่ถูกจัดเข้างาน",
  off: `งานนี้ไม่เปิดให้เปลี่ยนตัว${typeWord(type)}`,
  before: "ยังไม่ถึงเวลาเปลี่ยนตัว",
  after: "หมดเวลาเปลี่ยนตัวแล้ว",
  noEvents: "ยังไม่มีงานที่เปิดให้เปลี่ยนตัว",
  openTitle: "เปิดให้เปลี่ยนตัว",
  deadline: (n, at) => `${n} — เปลี่ยนตัวได้ถึง ${at}`,
  upcoming: (n, at) => `${n} — เปิดให้เปลี่ยนตัว ${at}`,
  ended: (n, at) => `${n} — ปิดการเปลี่ยนตัวเมื่อ ${at}`,
});

const subWin = (e: SubWindowEvent, type: CompType): Window => ({
  enabled: type === "team" ? e.subOpenTeam : e.subOpenIndividual,
  start: e.subStart,
  end: e.subEnd,
});

/**
 * ตอนนี้เปลี่ยนตัวในรายการประเภทนี้ได้ไหม + ถ้าไม่ เพราะอะไร (admin ไม่ต้องผ่านด่านนี้)
 * ถามเป็นราย "ประเภทรายการ" ไม่ใช่รายงาน เพราะงานเดียวกันเปิดทีมแต่ปิดเดี่ยวได้
 */
export function substitutionWindow(
  event: SubWindowEvent | null | undefined,
  type: CompType,
  now: Date = new Date()
): { open: boolean; reason: string | null } {
  return evalWindow(event ? subWin(event, type) : null, subTexts(type), now);
}

/**
 * สรุปช่วงเปลี่ยนตัวของงานหนึ่งเป็นข้อความสั้น ๆ ติดบนการ์ดงาน
 * ปิดทั้งคู่ = null (ไม่ต้องขึ้นป้าย) · เปิดอย่างน้อยหนึ่งประเภท = บอกว่าเปิดอะไรและถึงเมื่อไหร่
 */
export function substitutionSummary(
  event: SubWindowEvent,
  now: Date = new Date()
): { label: string; open: boolean } | null {
  const types: CompType[] = [];
  if (event.subOpenIndividual) types.push("individual");
  if (event.subOpenTeam) types.push("team");
  if (!types.length) return null;

  const w = substitutionWindow(event, types[0], now);
  const what = types.length === 2 ? "เดี่ยว+ทีม" : types[0] === "team" ? "เฉพาะทีม" : "เฉพาะเดี่ยว";
  if (!w.open) return { label: `${w.reason} (${what})`, open: false };
  return {
    label: event.subEnd
      ? `เปลี่ยนตัวได้ (${what}) ถึง ${formatThaiDateTime(event.subEnd)}`
      : `เปลี่ยนตัวได้ (${what})`,
    open: true,
  };
}

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
  groupSort: number; // ลำดับหมวดตามที่ admin ตั้งไว้ — ใช้เรียง optgroup ใน dropdown ให้ตรงกับหน้าหมวด
  levels: string[]; // ระดับชั้นที่รายการรับ — ใช้จำกัด StudentPicker ตอนเพิ่มสมาชิกทีม
  teamSizeMin: number | null;
  teamSizeMax: number | null;
  allowCrossClass: boolean; // ทีมมีสมาชิกข้ามห้องได้ (false = ต้องห้องเดียวกันทั้งทีม)
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  capacity: number; // < 0 = ไม่จำกัด
  registered: number;
  open: boolean; // งานเปิดรับสมัครและอยู่ในช่วงเวลา (admin override ข้ามได้)
  /**
   * รายการนี้ซ่อนจากนักเรียน — จะโผล่ในลิสต์นี้เฉพาะคนที่ลงชื่อให้ได้จริง
   * (ครูเจ้าของรายการ/หมวดเดียวกัน, recorder, admin) ครูประจำชั้นทั่วไปจะไม่เห็นเลย
   */
  hiddenFromStudents: boolean;
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
