/**
 * ตรวจว่า DB ที่ DATABASE_URL ชี้อยู่ "ตามหลัง" migration ไหนบ้าง — ไม่แก้อะไรทั้งสิ้น (อ่านอย่างเดียว)
 *   node drizzle/check_schema.mjs
 *
 * ใช้ก่อน deploy ทุกครั้ง: drizzle-kit push เดาไม่ออกเมื่อคอลัมน์หายพร้อมคอลัมน์ใหม่โผล่
 * (venue_id → allow_cross_class) แล้วจะถามว่า rename ใช่ไหม — ตอบผิดได้ schema เพี้ยนแบบเงียบ ๆ
 * เช็คด้วยไฟล์นี้ก่อน แล้วรัน apply_*.mjs ที่ขาดไป push จะไม่มีอะไรให้ถามอีก
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const table = async (name) =>
  (await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [name]))
    .rowCount > 0;
const column = async (t, c) =>
  (await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [t, c]))
    .rowCount > 0;

// เรียงตามลำดับที่ต้องรัน — ตรวจจาก "ร่องรอยใน schema" ไม่ใช่ตารางบันทึกเวอร์ชัน (โปรเจกต์นี้ใช้ push ไม่มี migration table)
const CHECKS = [
  { id: "0002", what: "ระบบงาน (Event)", how: () => table("events"), fix: "node drizzle/apply_0002_events.mjs" },
  { id: "0003", what: "งานเริ่มต้นของแต่ละปี", how: () => column("settings", "default_event_id"), fix: "node drizzle/apply_0003.mjs" },
  { id: "0004", what: "หลายห้องต่อรายการ", how: async () => (await table("competition_venues")) && !(await column("competitions", "venue_id")), fix: "node drizzle/apply_0004.mjs" },
  { id: "0005", what: "ทีมข้ามห้อง", how: () => column("competitions", "allow_cross_class"), fix: "node drizzle/apply_0005.mjs" },
  { id: "0006", what: "รายการไม่มีการแข่งขัน", how: () => column("competitions", "no_contest"), fix: "node drizzle/apply_0006.mjs" },
  { id: "0007", what: "ประกาศ (announcement)", how: () => table("announcements"), fix: "node drizzle/apply_0007.mjs" },
  { id: "0008", what: "IP ใน audit log", how: () => column("audit_log", "ip"), fix: "node drizzle/apply_0008.mjs" },
  { id: "0009", what: "เลขที่ในห้อง (snapshot)", how: () => column("entry_members", "class_number_snapshot"), fix: "node drizzle/apply_0009.mjs" },
  { id: "0010", what: "สีผู้ลงนามบนเกียรติบัตร", how: () => column("certificate_signatures", "color"), fix: "node drizzle/apply_0010.mjs" },
];

try {
  const missing = [];
  for (const c of CHECKS) {
    const ok = await c.how();
    console.log(`${ok ? "✅" : "❌"} ${c.id} ${c.what}`);
    if (!ok) missing.push(c);
  }

  if (!missing.length) {
    console.log("\n🎉 schema ครบแล้ว — `npm run db:push` จะไม่มีอะไรให้ถาม");
  } else {
    console.log("\n⚠️  ยังขาด — รันตามลำดับนี้ก่อน db:push / build:");
    for (const c of missing) console.log(`   ${c.fix}`);
    process.exitCode = 1;
  }
} catch (e) {
  console.error("❌ ต่อ DB ไม่ได้:", e.message);
  process.exitCode = 2;
} finally {
  await pool.end();
}
