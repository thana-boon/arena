import { requireStaff } from "@/lib/auth/guards";
import { getMyCertificates } from "@/lib/certificates";
import { normalizeTeacherCode } from "@/lib/external/teacher-api";
import { MyCertificates } from "@/components/certificate/MyCertificates";

export const dynamic = "force-dynamic";

/**
 * เกียรติบัตรของครูเอง — ใบจากกิจกรรมของครู (participant_type = teacher) ที่ติ๊กชื่อครูคนนี้ไว้
 * แบบเดียวกับหน้าเกียรติบัตรของนักเรียน: ดู/บันทึกเป็น PDF ได้เอง ทุกปีการศึกษา
 * · รหัสครูใน entry_members ถูก normalize เป็นตัวพิมพ์ใหญ่ตอนติ๊ก — ต้องเทียบด้วยรูปเดียวกัน
 * · ชื่อที่พิมพ์เพิ่มเอง (EXT-xxxx) ไม่ผูกกับบัญชีใคร จึงไม่โผล่ที่นี่ ให้ผู้จัดออกจากหน้าออกเกียรติบัตรแทน
 */
export default async function TeacherMyCertificatesPage() {
  const session = await requireStaff();
  const certs = await getMyCertificates(normalizeTeacherCode(session.code), "teacher");

  return (
    <div className="stack">
      <div className="page-header">
        <h1>เกียรติบัตรของฉัน</h1>
        <div className="subtitle">
          กด “เปิดดูเกียรติบัตร” แล้วเลือกปลายทางเป็น “บันทึกเป็น PDF” ในหน้าต่างพิมพ์ · เก็บไฟล์ไว้เองได้เลย
        </div>
      </div>
      <MyCertificates
        rows={certs.map((c) => ({ ...c, issuedAt: c.issuedAt.toISOString() }))}
        emptyHint="เมื่อผู้จัดกิจกรรมของครูออกเกียรติบัตรที่มีชื่อท่าน ใบของท่านจะมาอยู่ที่นี่"
      />
    </div>
  );
}
