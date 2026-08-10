/**
 * เพิ่มคอลัมน์ "ไม่มาแข่งขัน" (รายคน) ในตาราง entry_members — ใช้ DATABASE_URL จาก .env
 *   node drizzle/apply_0014.mjs
 * ปลอดภัยเมื่อรันซ้ำ (เช็คก่อนว่ามีคอลัมน์แล้วหรือยัง)
 * ข้อมูลเดิมได้ absent = false = มาแข่งตามปกติ → ออกเกียรติบัตรเหมือนเดิมทุกใบ
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const has = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='entry_members' AND column_name='absent'`
  );
  if (has.rowCount) {
    console.log("✔ มีคอลัมน์ entry_members.absent แล้ว — ข้าม");
  } else {
    await pool.query(`ALTER TABLE "entry_members" ADD COLUMN "absent" boolean DEFAULT false NOT NULL`);
    console.log("✅ เพิ่มคอลัมน์ “ไม่มาแข่งขัน” แล้ว (ข้อมูลเดิม = มาแข่งตามปกติ)");
    console.log("   ติ๊กได้ที่ หน้าบันทึกผล → ช่อง “ไม่มาแข่งขัน” ท้ายชื่อแต่ละคน");
  }
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
