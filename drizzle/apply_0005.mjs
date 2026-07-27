/**
 * เพิ่มคอลัมน์ competitions.allow_cross_class (ทีมข้ามห้อง) — ใช้ DATABASE_URL จาก .env
 *   node drizzle/apply_0005.mjs
 * ปลอดภัยเมื่อรันซ้ำ (เช็คก่อนว่ามีคอลัมน์แล้วหรือยัง)
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const has = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='competitions' AND column_name='allow_cross_class'`
  );
  if (has.rowCount) {
    console.log("✔ มีคอลัมน์ allow_cross_class แล้ว — ข้าม");
  } else {
    await pool.query(
      `ALTER TABLE "competitions" ADD COLUMN "allow_cross_class" boolean DEFAULT false NOT NULL`
    );
    console.log("✅ เพิ่มคอลัมน์ competitions.allow_cross_class แล้ว (ค่าเริ่มต้น = ไม่ข้ามห้อง)");
  }
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
