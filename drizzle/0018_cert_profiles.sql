-- แบบเกียรติบัตรหลายแบบต่อหนึ่งงาน + คลังแม่แบบเริ่มต้น + ลายเซ็นที่บันทึกไว้
ALTER TABLE "certificate_templates" ADD COLUMN IF NOT EXISTS "name" varchar(191) DEFAULT '' NOT NULL;
ALTER TABLE "certificate_templates" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL;
DROP INDEX IF EXISTS "cert_tpl_event_medal_uniq";
CREATE INDEX IF NOT EXISTS "cert_tpl_event_idx" ON "certificate_templates" ("event_id");

-- แม่แบบเดิมของแต่ละงาน (medal_filter = '') กลายเป็น "แบบหลัก" ของงานนั้น
UPDATE "certificate_templates" SET "is_default" = true WHERE "medal_filter" = '' AND "is_default" = false;

CREATE TABLE IF NOT EXISTS "certificate_template_competitions" (
  "id" serial PRIMARY KEY NOT NULL,
  "template_id" integer NOT NULL,
  "competition_id" integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "cert_tpl_comp_uniq" ON "certificate_template_competitions" ("competition_id");
CREATE INDEX IF NOT EXISTS "cert_tpl_comp_tpl_idx" ON "certificate_template_competitions" ("template_id");

CREATE TABLE IF NOT EXISTS "certificate_presets" (
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
);

CREATE TABLE IF NOT EXISTS "certificate_signature_presets" (
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
);
