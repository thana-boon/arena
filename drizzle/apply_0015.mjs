/**
 * เพิ่มระบบ "การเปลี่ยนตัวผู้เข้าแข่งขัน" — ใช้ DATABASE_URL จาก .env
 *   node drizzle/apply_0015.mjs
 * ปลอดภัยเมื่อรันซ้ำ (ทุกคำสั่งเป็น IF NOT EXISTS)
 *
 * ข้อมูลเดิมไม่เปลี่ยนพฤติกรรม: ทุกงานเริ่มด้วย "ปิดการเปลี่ยนตัว" ทั้งเดี่ยวและทีม
 * ผู้ดูแลระบบเปิดเองได้ที่ ตั้งค่า → งาน → การเปลี่ยนตัวผู้เข้าแข่งขัน
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const done = [];
try {
  await pool.query(`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sub_open_individual" boolean DEFAULT false NOT NULL`);
  await pool.query(`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sub_open_team" boolean DEFAULT false NOT NULL`);
  await pool.query(`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sub_start" timestamp`);
  await pool.query(`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sub_end" timestamp`);
  done.push("events: สวิตช์เปลี่ยนตัว (เดี่ยว/ทีม) + ช่วงเวลา");

  await pool.query(`ALTER TABLE "entry_members" ADD COLUMN IF NOT EXISTS "substituted" boolean DEFAULT false NOT NULL`);
  done.push("entry_members.substituted: ธงติดป้าย “(เปลี่ยนตัว)” ที่หน้าบันทึกผล");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "entry_substitutions" (
      "id" serial PRIMARY KEY NOT NULL,
      "competition_id" integer NOT NULL,
      "entry_id" integer NOT NULL,
      "member_id" integer NOT NULL,
      "out_student_code" varchar(64) NOT NULL,
      "out_name" varchar(191) NOT NULL,
      "out_class" varchar(64) DEFAULT '' NOT NULL,
      "in_student_code" varchar(64) NOT NULL,
      "in_name" varchar(191) NOT NULL,
      "in_class" varchar(64) DEFAULT '' NOT NULL,
      "reason" varchar(255) DEFAULT '' NOT NULL,
      "by_role" varchar(16) NOT NULL,
      "by_code" varchar(64) NOT NULL,
      "by_name" varchar(191) DEFAULT '' NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "sub_comp_idx" ON "entry_substitutions" ("competition_id")`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "sub_entry_idx" ON "entry_substitutions" ("entry_id")`);
  done.push("entry_substitutions: ประวัติว่าใครเปลี่ยนเป็นใคร ใครสั่ง เมื่อไหร่");

  console.log("✅ เพิ่มระบบการเปลี่ยนตัวแล้ว");
  for (const d of done) console.log("   ·", d);
  console.log("\n   ทุกงานเริ่มด้วย “ปิดการเปลี่ยนตัว” — เปิดได้ที่ ตั้งค่า → งาน → การเปลี่ยนตัวผู้เข้าแข่งขัน");
  console.log("   หน้าใช้งาน: ครู /teacher/substitutions · ผู้ดูแลระบบ /admin/substitutions");
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
