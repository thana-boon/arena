/**
 * เพิ่มการ "เช็คชื่อผู้เข้าร่วม" ของรายการที่ไม่มีการแข่งขัน — ใช้ DATABASE_URL จาก .env
 *   node drizzle/apply_0016.mjs
 * ปลอดภัยเมื่อรันซ้ำ (ทุกคำสั่งเป็น IF NOT EXISTS)
 *
 * ข้อมูลเดิมไม่ถูกแตะ: attendance_checked_at = null = "ยังไม่เคยเช็คชื่อ"
 * → รายการที่ไม่มีการแข่งขันซึ่งยังไม่ได้ออกเกียรติบัตร ต้องเข้าไปเช็คชื่อก่อนจึงจะออกใบได้
 *   (ใบที่ออกไปแล้วยังอยู่ครบ ไม่ถูกเพิกถอน)
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(`ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "attendance_checked_at" timestamp`);
  await pool.query(`ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "attendance_checked_by" varchar(64)`);

  const n = await pool.query(
    `SELECT count(*)::int AS n FROM "competitions" WHERE "no_contest" = true AND "attendance_checked_at" IS NULL`
  );
  console.log("✅ เพิ่มการเช็คชื่อผู้เข้าร่วมแล้ว");
  console.log("   · competitions.attendance_checked_at / _by: เช็คชื่อครั้งล่าสุดเมื่อไหร่ โดยใคร");
  console.log(`\n   รายการที่ไม่มีการแข่งขันซึ่งยังไม่ได้เช็คชื่อ: ${n.rows[0].n} รายการ`);
  console.log("   ครูเช็คชื่อได้ที่ บันทึกผล → เลือกรายการ (ปุ่มจะขึ้นว่า “เช็คชื่อ”)");
  console.log("   คนที่ไม่ได้ติ๊ก “เข้าร่วม” ถือว่าไม่มาร่วม จึงไม่ได้เกียรติบัตร");
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
