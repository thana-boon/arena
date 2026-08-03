import { requireStaff } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { listCertIssueEvents } from "@/lib/certIssuing";
import { CertEventGrid } from "@/components/certificate/CertEventGrid";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function TeacherCertificatesPage() {
  const session = await requireStaff();
  const year = await getActiveYear();
  if (!year) {
    return (
      <div className="empty-state card">
        <Icon name="warning" size={44} className="empty-ico" />
        <p>ยังไม่เปิดปีการศึกษา</p>
      </div>
    );
  }

  const { events, orphanCount } = await listCertIssueEvents(session, year.id);

  return (
    <div className="stack">
      <div className="page-header">
        <h1>ออกเกียรติบัตร</h1>
        <div className="subtitle">
          เลือกงานก่อน แล้วค่อยเลือกรายการในงานนั้น · ปีการศึกษา {year.yearBe}
        </div>
      </div>
      <CertEventGrid events={events} basePath="/teacher/certificates" orphanCount={orphanCount} />
    </div>
  );
}
