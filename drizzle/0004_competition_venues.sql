-- สถานที่แข่งขันหลายห้องต่อรายการ: competitions.venue_id → ตารางเชื่อม competition_venues
-- backfill: ย้าย venue_id เดิม (ถ้ามี) เป็นแถวแรกของตารางเชื่อม แล้วค่อย DROP คอลัมน์

--> statement-breakpoint
CREATE TABLE "competition_venues" (
  "id" serial PRIMARY KEY NOT NULL,
  "competition_id" integer NOT NULL,
  "venue_id" integer NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "comp_venue_uniq" ON "competition_venues" USING btree ("competition_id","venue_id");--> statement-breakpoint
CREATE INDEX "comp_venue_venue_idx" ON "competition_venues" USING btree ("venue_id");--> statement-breakpoint
INSERT INTO "competition_venues" ("competition_id", "venue_id", "sort_order")
  SELECT "id", "venue_id", 0 FROM "competitions" WHERE "venue_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" DROP COLUMN "venue_id";
