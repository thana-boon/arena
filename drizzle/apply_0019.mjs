/**
 * เพิ่ม "กิจกรรมที่ผู้เข้าร่วมเป็นครู" — ใช้ DATABASE_URL จาก .env
 *   node drizzle/apply_0019.mjs
 * ปลอดภัยเมื่อรันซ้ำ (IF NOT EXISTS)
 *
 * ข้อมูลเดิมไม่ถูกแตะ: ทุกรายการที่มีอยู่ได้ participant_type = 'student' (พฤติกรรมเดิมทุกอย่าง)
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(
    `ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "participant_type" varchar(16) NOT NULL DEFAULT 'student'`
  );
  console.log("✅ เพิ่มกิจกรรมที่ผู้เข้าร่วมเป็นครูแล้ว");
  console.log("   · competitions.participant_type: 'student' (เดิม) | 'teacher'");
  console.log("   สร้างได้ที่ รายการแข่งขัน → สร้างรายการ → ผู้เข้าร่วม “ครู”");
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
