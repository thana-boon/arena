-- ยกระดับ certificate_events → events (แกนกลางของระบบ) + ย้ายการรับสมัครมาที่ระดับงาน
-- หมายเหตุ: การ backfill ข้อมูล (ก๊อป event_id จาก join table, สร้างงานเริ่มต้น, ก๊อป reg window
--          จาก settings, แล้ว DROP join table) ทำใน src/db/backfill-events.ts เพราะต้องมี logic
--          ต่อปี/ต่อ settings — ไฟล์นี้เก็บเฉพาะ DDL ไว้เป็นบันทึกสำหรับ prod

--> statement-breakpoint
ALTER TABLE "certificate_events" RENAME TO "events";--> statement-breakpoint
ALTER INDEX "cert_event_year_idx" RENAME TO "event_year_idx";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "kind" varchar(16) DEFAULT 'competition' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "visible_to_students" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "registration_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "reg_start" timestamp;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "reg_end" timestamp;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "event_id" integer;--> statement-breakpoint
ALTER TABLE "competitions" ALTER COLUMN "subject_group_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "comp_event_idx" ON "competitions" USING btree ("event_id");--> statement-breakpoint
-- ย้ายความสัมพันธ์ join table → competitions.event_id
UPDATE "competitions" c SET "event_id" = ec."event_id"
  FROM "certificate_event_competitions" ec WHERE ec."competition_id" = c."id";--> statement-breakpoint
DROP TABLE "certificate_event_competitions";--> statement-breakpoint
DROP TABLE IF EXISTS "report_set_items";--> statement-breakpoint
DROP TABLE IF EXISTS "report_sets";
