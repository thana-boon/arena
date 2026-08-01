import { requireStaff } from "@/lib/auth/guards";
import { CertRegistry } from "@/components/certificate/CertRegistry";

export const dynamic = "force-dynamic";

export default async function TeacherCertRegistryPage() {
  await requireStaff();
  return (
    <div className="stack">
      <div className="page-header">
        <h1>ทะเบียนเกียรติบัตร</h1>
        <div className="subtitle">
          ศิษย์เก่ามาขอเกียรติบัตรย้อนหลัง — ค้นด้วยรหัสนักเรียนหรือชื่อได้ทุกปีการศึกษา
          แล้วกดพิมพ์ซ้ำได้ทันที
        </div>
      </div>
      <CertRegistry />
    </div>
  );
}
