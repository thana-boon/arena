-- ช่วงเวลาสร้าง/แก้ไขรายการแข่งขัน (ระดับงาน)
--
-- ของเดิมครูสร้าง/แก้/ลบรายการของตัวเองได้ตลอดเวลา — ครูจึงเข้าไปแก้รายการหลังนักเรียนลงทะเบียนไปแล้ว
-- โดยไม่มีใครรู้ ตอนนี้แต่ละงานกำหนดช่วงเวลาได้ นอกช่วงนั้นมีแต่ admin ที่ยังแก้ได้
--
-- ค่าเริ่มต้น comp_edit_open = true และช่วงเวลาเป็น null (= ไม่จำกัด) → งานเดิมทำงานเหมือนเดิมทุกประการ
-- จนกว่า admin จะเข้าไปตั้งเวลาเอง

--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "comp_edit_open" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "comp_edit_start" timestamp;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "comp_edit_end" timestamp;
