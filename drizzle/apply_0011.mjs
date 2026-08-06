/**
 * เพิ่มคอลัมน์ certificate_signatures.font_size (ขนาดชื่อผู้ลงนาม) — ใช้ DATABASE_URL จาก .env
 *   node drizzle/apply_0011.mjs
 * ปลอดภัยเมื่อรันซ้ำ (เช็คก่อนว่ามีคอลัมน์แล้วหรือยัง)
 * ค่าเริ่มต้น 1.2 = ขนาดเดิมที่เคยฝังไว้ในโค้ด แม่แบบเดิมจึงพิมพ์ออกมาเท่าเดิม
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const has = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='certificate_signatures' AND column_name='font_size'`
  );
  if (has.rowCount) {
    console.log("✔ มีคอลัมน์ certificate_signatures.font_size แล้ว — ข้าม");
  } else {
    await pool.query(
      `ALTER TABLE "certificate_signatures" ADD COLUMN "font_size" numeric(6,3) DEFAULT '1.2' NOT NULL`
    );
    console.log("✅ เพิ่มคอลัมน์ certificate_signatures.font_size แล้ว (ของเดิมได้ 1.2 = ขนาดเดิม)");
  }
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
