import { requireAdmin } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { listCertIssueEvents } from "@/lib/certIssuing";
import { CertEventGrid } from "@/components/certificate/CertEventGrid";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

/**
 * ออกเกียรติบัตรฝั่งแอดมิน — เนื้อหาเดียวกับ /teacher/certificates (admin เห็นทุกรายการ)
 * แยกเส้นทางไว้เพื่อให้อยู่ในเมนู/เชลล์ของแอดมิน ไม่ต้องเด้งข้ามไปมุมครู
 * (คนละหน้ากับ /admin/certificates ที่เป็นการ "ออกแบบ" เกียรติบัตรของแต่ละงาน)
 */
export default async function AdminCertIssuePage() {
  const session = await requireAdmin();
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
          เลือกงานก่อน แล้วค่อยเลือกรายการในงานนั้น · ออกแบบใบได้ที่เมนู “ออกแบบเกียรติบัตร” · ปีการศึกษา{" "}
          {year.yearBe}
        </div>
      </div>
      <CertEventGrid events={events} basePath="/admin/cert-issue" orphanCount={orphanCount} />
    </div>
  );
}
