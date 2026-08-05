/**
 * เพิ่มคอลัมน์ audit_log.ip (IP ของเครื่องที่สั่งงาน) — ใช้ DATABASE_URL จาก .env
 *   node drizzle/apply_0008.mjs
 * ปลอดภัยเมื่อรันซ้ำ (เช็คก่อนว่ามีคอลัมน์แล้วหรือยัง)
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const has = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='audit_log' AND column_name='ip'`
  );
  if (has.rowCount) {
    console.log("✔ มีคอลัมน์ audit_log.ip แล้ว — ข้าม");
  } else {
    await pool.query(`ALTER TABLE "audit_log" ADD COLUMN "ip" varchar(64) DEFAULT '' NOT NULL`);
    console.log("✅ เพิ่มคอลัมน์ audit_log.ip แล้ว (บันทึกเก่าได้ค่าว่าง)");
  }
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
