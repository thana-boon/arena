/**
 * เพิ่ม "หมวดร่วม" ของรายการแข่งขัน — ใช้ DATABASE_URL จาก .env
 *   node drizzle/apply_0017.mjs
 * ปลอดภัยเมื่อรันซ้ำ (ทุกคำสั่งเป็น IF NOT EXISTS)
 *
 * ไม่แตะข้อมูลเดิม: ตารางว่าง = ทุกรายการยังเป็นหมวดเดียวเหมือนเดิม
 * หมวดหลักยังอยู่ที่ competitions.subject_group_id — ตารางนี้เก็บเฉพาะหมวดที่ทำร่วมกันเพิ่ม
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS "competition_subject_groups" (
    "id" serial PRIMARY KEY NOT NULL,
    "competition_id" integer NOT NULL,
    "subject_group_id" integer NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
  )`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "comp_sgroup_uniq" ON "competition_subject_groups" ("competition_id","subject_group_id")`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS "comp_sgroup_group_idx" ON "competition_subject_groups" ("subject_group_id")`
  );

  console.log("✅ เพิ่มตารางหมวดร่วมของรายการแข่งขันแล้ว (competition_subject_groups)");
  console.log("   · รายการหนึ่งเลือกกลุ่มสาระร่วมได้หลายหมวดในฟอร์มสร้าง/แก้ไขรายการ");
  console.log("   · ครูในหมวดร่วมเห็น/แก้/บันทึกคะแนนรายการนั้นได้เหมือนหมวดเจ้าของ");
  console.log("   · ข้อมูลเดิมไม่ถูกแตะ — รายการที่มีอยู่ยังเป็นหมวดเดียวจนกว่าจะไปเพิ่มเอง");
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
