-- ทีมข้ามห้อง: competitions.allow_cross_class
-- false (ค่าเริ่มต้น) = สมาชิกทีมต้องอยู่ห้องเรียนเดียวกันทั้งหมด (ระดับชั้น+ห้อง)
-- true = เลือกสมาชิกข้ามห้องได้
-- ข้อมูลเดิมทั้งหมดได้ค่า false ตาม default (ตั้งใจ — ค่อยไปเปิดเป็นรายรายการทีหลัง)

--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "allow_cross_class" boolean DEFAULT false NOT NULL;
