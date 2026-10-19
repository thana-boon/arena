-- กิจกรรมที่ผู้เข้าร่วมเป็นครู
--
-- competitions.participant_type: 'student' (ค่าเริ่มต้น = ทุกรายการเดิม) | 'teacher'
-- รายการของครูติ๊กรายชื่อครูจาก SchoolOS เป็นผู้เข้าร่วม แล้วออกเกียรติบัตรให้ — ใช้ entries/entry_members
-- ชุดเดิม (student_code เก็บรหัสครู) จึงไม่ต้องมีตารางใหม่ ; ข้อมูลเดิมไม่ถูกแตะ

--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "participant_type" varchar(16) NOT NULL DEFAULT 'student';
