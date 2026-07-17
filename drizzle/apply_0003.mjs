/**
 * เพิ่มคอลัมน์ settings.default_event_id (งานเริ่มต้น) — ใช้ DATABASE_URL จาก .env
 *   node drizzle/apply_0003.mjs
 * ปลอดภัยเมื่อรันซ้ำ (เช็คก่อนว่ามีคอลัมน์แล้วหรือยัง)
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const has = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='default_event_id'`
  );
  if (has.rowCount) {
    console.log("✔ มีคอลัมน์ default_event_id แล้ว — ข้าม");
  } else {
    await pool.query(`ALTER TABLE "settings" ADD COLUMN "default_event_id" integer`);
    console.log("✅ เพิ่มคอลัมน์ settings.default_event_id แล้ว");
  }
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
