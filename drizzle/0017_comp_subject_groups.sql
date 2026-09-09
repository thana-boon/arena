-- หมวดร่วมของรายการแข่งขัน (รายการเดียวทำร่วมกันได้หลายกลุ่มสาระ)
--
-- เดิมรายการผูกกับหมวดเดียว (competitions.subject_group_id) แต่ของจริงมีรายการที่หลายกลุ่มสาระ
-- ทำร่วมกัน — ครูอีกหมวดจึงมองไม่เห็น/บันทึกคะแนนไม่ได้ ต้องไปฝากหมวดเจ้าของทำให้ทุกครั้ง
--
-- ตารางนี้เก็บเฉพาะ "หมวดร่วม" ที่เพิ่มเข้ามา ส่วนหมวดหลักยังอยู่ที่ competitions.subject_group_id
-- (การจัดกลุ่ม/เรียง/ชื่อหมวดบนเกียรติบัตรยังต้องมีหมวดเจ้าของหมวดเดียว) → ไม่มีแถว = เหมือนเดิมทุกอย่าง
-- ข้อมูลเดิมจึงไม่ต้อง backfill และพฤติกรรมของรายการที่มีอยู่ไม่เปลี่ยน

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "competition_subject_groups" (
  "id" serial PRIMARY KEY NOT NULL,
  "competition_id" integer NOT NULL,
  "subject_group_id" integer NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comp_sgroup_uniq" ON "competition_subject_groups" ("competition_id","subject_group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comp_sgroup_group_idx" ON "competition_subject_groups" ("subject_group_id");
