/**
 * เพิ่มคอลัมน์ช่วงเวลาสร้าง/แก้ไขรายการแข่งขันในตาราง events — ใช้ DATABASE_URL จาก .env
 *   node drizzle/apply_0013.mjs
 * ปลอดภัยเมื่อรันซ้ำ (เช็คก่อนว่ามีคอลัมน์แล้วหรือยัง)
 * งานเดิมได้ comp_edit_open = true + ช่วงเวลาว่าง = ไม่จำกัด → พฤติกรรมเหมือนเดิมจนกว่า admin จะตั้งเวลา
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const has = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='comp_edit_open'`
  );
  if (has.rowCount) {
    console.log("✔ มีคอลัมน์ events.comp_edit_open แล้ว — ข้าม");
  } else {
    await pool.query(`ALTER TABLE "events" ADD COLUMN "comp_edit_open" boolean DEFAULT true NOT NULL`);
    await pool.query(`ALTER TABLE "events" ADD COLUMN "comp_edit_start" timestamp`);
    await pool.query(`ALTER TABLE "events" ADD COLUMN "comp_edit_end" timestamp`);
    console.log("✅ เพิ่มช่วงเวลาสร้าง/แก้ไขรายการแข่งขันแล้ว (งานเดิม = เปิดไว้ ไม่จำกัดเวลา)");
    console.log("   ตั้งเวลาได้ที่ ตั้งค่า → งาน → แก้ไข");
  }
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
