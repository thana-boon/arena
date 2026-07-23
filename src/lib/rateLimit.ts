import "server-only";

/**
 * Rate limit การ login แบบ in-memory — นับ "ครั้งที่ล้มเหลว" ต่อ key (ip|identifier)
 * เกินเพดานในหน้าต่างเวลา → บล็อกจนกว่าหน้าต่างจะหมดอายุ
 *
 * ใช้ Map ในโปรเซสได้เพราะระบบรัน instance เดียว (PM2 fork / container เดียว)
 * ⚠️ ถ้าวันหนึ่งสเกลเป็นหลาย instance ต้องย้ายไปเก็บใน Postgres/Redis แทน
 *
 * เส้นทาง SchoolOS มี 429 ของตัวเองอยู่แล้ว — ตัวนี้เน้นปิดช่อง brute force
 * รหัส admin local (bcrypt ใน DB เรา) ที่เดิมยิงได้ไม่จำกัด
 */

const MAX_FAILS = 5; // พลาดได้กี่ครั้งในหนึ่งหน้าต่าง
const WINDOW_MS = 60_000; // ขนาดหน้าต่าง (1 นาที)
const MAX_KEYS = 5_000; // เพดานขนาด Map กันโตไม่จำกัด (ยิงสุ่ม key รัว ๆ)

type Bucket = { fails: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function sweepExpired(now: number): void {
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

/** ถ้าถูกบล็อกอยู่ คืนจำนวนวินาทีที่ต้องรอ — ไม่บล็อกคืน null */
export function loginBlockedFor(key: string): number | null {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) return null;
  if (b.fails < MAX_FAILS) return null;
  return Math.max(1, Math.ceil((b.resetAt - now) / 1000));
}

/** เรียกเมื่อ login ล้มเหลว (รหัสผิด) */
export function loginFailed(key: string): void {
  const now = Date.now();
  if (buckets.size >= MAX_KEYS) sweepExpired(now);
  if (buckets.size >= MAX_KEYS) buckets.clear(); // ยังเต็มอยู่ = ถูกยิงสุ่ม key — ทิ้งทั้งก้อนดีกว่ากิน RAM
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { fails: 1, resetAt: now + WINDOW_MS });
  } else {
    b.fails++;
  }
}

/** เรียกเมื่อ login สำเร็จ — ล้างประวัติพลาดของ key นั้น */
export function loginSucceeded(key: string): void {
  buckets.delete(key);
}

/** ดึง IP ผู้เรียกจาก header (อยู่หลัง reverse proxy → x-forwarded-for ตัวแรก) */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
