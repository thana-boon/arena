import { requireStaff } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { listSubEvents } from "@/lib/substitutions";
import { SubEventGrid } from "@/components/substitution/SubEventGrid";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function TeacherSubstitutionsPage() {
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

  const { events, orphanCount } = await listSubEvents(session, year.id);

  return (
    <div className="stack">
      <div className="page-header">
        <h1>การเปลี่ยนตัว</h1>
        <div className="subtitle">
          เลือกงาน → เลือกรายการ → เปลี่ยนตัวผู้เข้าแข่งขันทีละคน · ท่านเห็นเฉพาะรายการในหมวดของท่าน ·
          ปีการศึกษา {year.yearBe}
        </div>
      </div>
      <SubEventGrid events={events} basePath="/teacher/substitutions" orphanCount={orphanCount} />
    </div>
  );
}
