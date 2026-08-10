import { requireAdmin } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { listSubEvents } from "@/lib/substitutions";
import { SubEventGrid } from "@/components/substitution/SubEventGrid";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

/**
 * การเปลี่ยนตัวฝั่งแอดมิน — เนื้อหาเดียวกับ /teacher/substitutions (admin เห็นทุกรายการ
 * และเปลี่ยนได้ตลอดเวลา) แยกเส้นทางไว้ให้อยู่ในเมนู/เชลล์ของแอดมิน ไม่ต้องเด้งข้ามไปมุมครู
 */
export default async function AdminSubstitutionsPage() {
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

  const { events, orphanCount } = await listSubEvents(session, year.id);

  return (
    <div className="stack">
      <div className="page-header">
        <h1>การเปลี่ยนตัว</h1>
        <div className="subtitle">
          เลือกงาน → เลือกรายการ → เปลี่ยนตัวผู้เข้าแข่งขันทีละคน · เปิด/ปิดและตั้งช่วงเวลาเปลี่ยนตัวได้ที่
          เมนู “ตั้งค่า” → งาน · ปีการศึกษา {year.yearBe}
        </div>
      </div>
      <SubEventGrid events={events} basePath="/admin/substitutions" orphanCount={orphanCount} isAdmin />
    </div>
  );
}
