/**
 * เพิ่มคอลัมน์ certificate_signatures.image_scale (ขนาดเฉพาะรูปลายเซ็น) — ใช้ DATABASE_URL จาก .env
 *   node drizzle/apply_0012.mjs
 * ปลอดภัยเมื่อรันซ้ำ (เช็คก่อนว่ามีคอลัมน์แล้วหรือยัง)
 * ค่าเริ่มต้น 1 = ขนาดเดิมที่ผูกกับความกว้างกล่อง แม่แบบเดิมจึงพิมพ์ออกมาเท่าเดิม
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const has = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='certificate_signatures' AND column_name='image_scale'`
  );
  if (has.rowCount) {
    console.log("✔ มีคอลัมน์ certificate_signatures.image_scale แล้ว — ข้าม");
  } else {
    await pool.query(
      `ALTER TABLE "certificate_signatures" ADD COLUMN "image_scale" numeric(6,3) DEFAULT '1' NOT NULL`
    );
    console.log("✅ เพิ่มคอลัมน์ certificate_signatures.image_scale แล้ว (ของเดิมได้ 1 = ขนาดเดิม)");
  }
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
