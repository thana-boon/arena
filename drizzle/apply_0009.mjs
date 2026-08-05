/**
 * เพิ่มคอลัมน์ entry_members.class_number_snapshot (เลขที่ในห้อง) — ใช้ DATABASE_URL จาก .env
 *   node drizzle/apply_0009.mjs
 * ปลอดภัยเมื่อรันซ้ำ (เช็คก่อนว่ามีคอลัมน์แล้วหรือยัง)
 * ข้อมูลเก่าได้ค่าว่าง — เติมย้อนหลังด้วย `node drizzle/backfill_0009_class_numbers.mjs`
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const has = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='entry_members' AND column_name='class_number_snapshot'`
  );
  if (has.rowCount) {
    console.log("✔ มีคอลัมน์ entry_members.class_number_snapshot แล้ว — ข้าม");
  } else {
    await pool.query(
      `ALTER TABLE "entry_members" ADD COLUMN "class_number_snapshot" varchar(16) DEFAULT '' NOT NULL`
    );
    console.log("✅ เพิ่มคอลัมน์ entry_members.class_number_snapshot แล้ว (ข้อมูลเก่าได้ค่าว่าง)");
    console.log("   ขั้นต่อไป: node drizzle/backfill_0009_class_numbers.mjs --dry");
  }
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
