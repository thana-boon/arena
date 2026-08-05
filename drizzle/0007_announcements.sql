-- ประกาศ (announcement): admin พิมพ์ข้อความที่หน้าตั้งค่า แล้วขึ้นเป็นแถบบนทุกหน้าหลังล็อกอิน
-- is_active = false ตอนสร้าง (ตั้งใจ — พิมพ์เสร็จค่อยกดเปิด จะได้ไม่หลุดออกไปกลางคัน)
-- ไม่ผูก year_id: ประกาศเป็นเรื่องของ "ตอนนี้" ปิดเองเมื่อหมดเรื่อง

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcements" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" varchar(191) DEFAULT '' NOT NULL,
  "body" text NOT NULL,
  "level" varchar(16) DEFAULT 'info' NOT NULL,
  "audience" varchar(16) DEFAULT 'all' NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "dismissible" boolean DEFAULT true NOT NULL,
  "created_by" varchar(64) DEFAULT '' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ann_active_idx" ON "announcements" ("is_active");
