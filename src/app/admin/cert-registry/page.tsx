import { requireAdmin } from "@/lib/auth/guards";
import { CertRegistry } from "@/components/certificate/CertRegistry";

export const dynamic = "force-dynamic";

export default async function AdminCertRegistryPage() {
  await requireAdmin();
  return (
    <div className="stack">
      <div className="page-header">
        <h1>ทะเบียนเกียรติบัตร</h1>
        <div className="subtitle">
          ค้นเกียรติบัตรย้อนหลังทุกปีการศึกษาด้วยรหัสนักเรียนหรือชื่อ · พิมพ์ซ้ำใบที่เคยออก
          หรือออกใบให้ผู้เข้าร่วมที่ยังไม่เคยได้รับ
        </div>
      </div>
      <CertRegistry />
    </div>
  );
}
