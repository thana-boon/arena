/**
 * เพิ่มคอลัมน์ certificate_signatures.color (สีผู้ลงนามบนเกียรติบัตร) — ใช้ DATABASE_URL จาก .env
 *   node drizzle/apply_0010.mjs
 * ปลอดภัยเมื่อรันซ้ำ (เช็คก่อนว่ามีคอลัมน์แล้วหรือยัง)
 * ข้อมูลเก่าได้ #1f2937 = สีเดิมที่เคยฝังไว้ในโค้ด ใบเดิมจึงไม่เปลี่ยนหน้าตา
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const has = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='certificate_signatures' AND column_name='color'`
  );
  if (has.rowCount) {
    console.log("✔ มีคอลัมน์ certificate_signatures.color แล้ว — ข้าม");
  } else {
    await pool.query(
      `ALTER TABLE "certificate_signatures" ADD COLUMN "color" varchar(32) DEFAULT '#1f2937' NOT NULL`
    );
    console.log("✅ เพิ่มคอลัมน์ certificate_signatures.color แล้ว (ของเดิมได้ #1f2937)");
  }
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
