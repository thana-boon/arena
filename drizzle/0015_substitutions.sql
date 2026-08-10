-- การเปลี่ยนตัวผู้เข้าแข่งขัน
--
-- 1) events: เปิด/ปิดการเปลี่ยนตัว แยกเดี่ยว/ทีม + ช่วงเวลาที่เปลี่ยนได้ (ใช้ร่วมกันทั้งสองประเภท)
--    ค่าเริ่มต้น false ทั้งคู่ → งานเดิมทุกงานยังเปลี่ยนตัวไม่ได้ พฤติกรรมไม่เปลี่ยนจนกว่าจะเปิดเอง
-- 2) entry_members.substituted: ธงติดป้าย "(เปลี่ยนตัว)" ที่หน้าบันทึกผล (ไม่ขึ้นบนเกียรติบัตร)
-- 3) entry_substitutions: ประวัติว่าใครเปลี่ยนเป็นใคร ใครสั่ง เมื่อไหร่ — คนที่ถูกเปลี่ยนออก
--    ไม่เหลือแถวไหนอ้างถึงเขาอีก จึงต้อง snapshot ทั้งฝั่งเข้าและออกไว้ที่นี่

--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sub_open_individual" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sub_open_team" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sub_start" timestamp;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sub_end" timestamp;
--> statement-breakpoint
ALTER TABLE "entry_members" ADD COLUMN IF NOT EXISTS "substituted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
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
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sub_comp_idx" ON "entry_substitutions" ("competition_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sub_entry_idx" ON "entry_substitutions" ("entry_id");
