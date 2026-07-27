-- รายการที่ไม่มีการแข่งขัน: competitions.no_contest
-- false (ค่าเริ่มต้น) = รายการแข่งขันปกติ (มีคะแนน/อันดับ/เหรียญ)
-- true = ใช้ลงทะเบียนรายชื่อ + ออกเกียรติบัตร "เข้าร่วมกิจกรรม" อย่างเดียว
-- ข้อมูลเดิมทั้งหมดได้ค่า false ตาม default (ตั้งใจ — รายการที่สร้างไว้แล้วเป็นการแข่งขันทั้งหมด)

--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "no_contest" boolean DEFAULT false NOT NULL;
