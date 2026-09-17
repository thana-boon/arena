/**
 * แบบเกียรติบัตรหลายแบบต่อหนึ่งงาน + คลังแม่แบบเริ่มต้น + ลายเซ็นที่บันทึกไว้
 *   node drizzle/apply_0018.mjs
 * ปลอดภัยเมื่อรันซ้ำ (IF NOT EXISTS ทุกคำสั่ง)
 *
 * ของเดิมไม่เปลี่ยนพฤติกรรม: แม่แบบเดิมของแต่ละงานถูกตั้งเป็น "แบบหลัก" (is_default)
 * ซึ่งเป็นแบบที่ทุกรายการในงานใช้อยู่แล้วเมื่อยังไม่มีการผูกแบบรายรายการ
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(
    `ALTER TABLE "certificate_templates" ADD COLUMN IF NOT EXISTS "name" varchar(191) DEFAULT '' NOT NULL`
  );
  await pool.query(
    `ALTER TABLE "certificate_templates" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL`
  );
  // unique(event_id, medal_filter) กันไม่ให้งานหนึ่งมีหลายแบบ — ถอดออก
  await pool.query(`DROP INDEX IF EXISTS "cert_tpl_event_medal_uniq"`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS "cert_tpl_event_idx" ON "certificate_templates" ("event_id")`
  );
  const promoted = await pool.query(
    `UPDATE "certificate_templates" SET "is_default" = true WHERE "medal_filter" = '' AND "is_default" = false`
  );

  await pool.query(`CREATE TABLE IF NOT EXISTS "certificate_template_competitions" (
    "id" serial PRIMARY KEY NOT NULL,
    "template_id" integer NOT NULL,
    "competition_id" integer NOT NULL
  )`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "cert_tpl_comp_uniq" ON "certificate_template_competitions" ("competition_id")`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS "cert_tpl_comp_tpl_idx" ON "certificate_template_competitions" ("template_id")`
  );

  await pool.query(`CREATE TABLE IF NOT EXISTS "certificate_presets" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar(191) NOT NULL,
    "description" varchar(255) DEFAULT '' NOT NULL,
    "orientation" varchar(16) DEFAULT 'landscape' NOT NULL,
    "background_asset_id" integer,
    "layout" text DEFAULT '[]' NOT NULL,
    "signatures" text DEFAULT '[]' NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_by" varchar(64) DEFAULT '' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS "certificate_signature_presets" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar(191) DEFAULT '' NOT NULL,
    "role_label" varchar(191) DEFAULT '' NOT NULL,
    "mode" varchar(16) DEFAULT 'image' NOT NULL,
    "asset_id" integer,
    "color" varchar(32) DEFAULT '#1f2937' NOT NULL,
    "font_size" numeric(6,3) DEFAULT '1.2' NOT NULL,
    "image_scale" numeric(6,3) DEFAULT '1' NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" varchar(64) DEFAULT '' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`);

  console.log("✅ เพิ่มแบบเกียรติบัตรหลายแบบต่องาน + คลังแม่แบบ/ลายเซ็นเริ่มต้นแล้ว");
  console.log(`   · ตั้งแม่แบบเดิมเป็น "แบบหลัก" ของงาน ${promoted.rowCount ?? 0} งาน`);
  console.log("   · certificate_template_competitions = รายการไหนใช้แบบไหน (ไม่ผูก = แบบหลัก)");
  console.log("   · certificate_presets / certificate_signature_presets = คลังไว้หยิบใช้ซ้ำ");
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
