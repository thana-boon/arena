import { requireRole } from "@/lib/auth/guards";
import { getMyCertificates } from "@/lib/certificates";
import { MyCertificates } from "./MyCertificates";

export const dynamic = "force-dynamic";

/**
 * เกียรติบัตรของนักเรียนเอง — ดู/บันทึกเป็น PDF ได้ด้วยตัวเอง ทุกปีที่ยังเรียนอยู่
 * นักเรียนที่จบ/ลาออกแล้วเข้าหน้านี้ไม่ได้ (ล็อกอินไม่ผ่านตั้งแต่ SchoolOS) — ให้ครูออกให้จาก
 * หน้า "ทะเบียนเกียรติบัตร" แทน ซึ่งค้นย้อนหลังได้ทุกปีอยู่แล้ว
 */
export default async function StudentCertificatesPage() {
  const session = await requireRole("student");
  const certs = await getMyCertificates(session.code);

  return (
    <div className="stack">
      <div className="page-header">
        <h1>เกียรติบัตรของฉัน</h1>
        <div className="subtitle">
          กด “เปิด / บันทึก PDF” แล้วเลือกปลายทางเป็น “บันทึกเป็น PDF” ในหน้าต่างพิมพ์ · เก็บไฟล์ไว้เองได้เลย
        </div>
      </div>
      <MyCertificates
        rows={certs.map((c) => ({ ...c, issuedAt: c.issuedAt.toISOString() }))}
      />
    </div>
  );
}
