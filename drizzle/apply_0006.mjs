/**
 * เพิ่มคอลัมน์ competitions.no_contest (รายการที่ไม่มีการแข่งขัน) — ใช้ DATABASE_URL จาก .env
 *   node drizzle/apply_0006.mjs
 * ปลอดภัยเมื่อรันซ้ำ (เช็คก่อนว่ามีคอลัมน์แล้วหรือยัง)
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const has = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='competitions' AND column_name='no_contest'`
  );
  if (has.rowCount) {
    console.log("✔ มีคอลัมน์ no_contest แล้ว — ข้าม");
  } else {
    await pool.query(
      `ALTER TABLE "competitions" ADD COLUMN "no_contest" boolean DEFAULT false NOT NULL`
    );
    console.log("✅ เพิ่มคอลัมน์ competitions.no_contest แล้ว (ค่าเริ่มต้น = เป็นการแข่งขัน)");
  }
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
