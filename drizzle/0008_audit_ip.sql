-- บันทึก IP ของเครื่องที่สั่งงานลง audit_log
-- บันทึกเก่าที่มีอยู่แล้วได้ค่าว่าง (ตั้งใจ — ตอนนั้นไม่ได้เก็บ ไม่ใช่ว่าอ่านไม่ได้)
-- ยาว 64 เผื่อ IPv6 เต็มรูป (45 ตัวอักษร)

--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "ip" varchar(64) DEFAULT '' NOT NULL;
