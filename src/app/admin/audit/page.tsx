import { requireAdmin } from "@/lib/auth/guards";
import { Icon } from "@/components/Icon";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  create_year: "สร้างปีการศึกษา",
  activate_year: "เปิดใช้งานปีการศึกษา",
  update_settings: "แก้ไขการตั้งค่า",
  set_teacher_role: "ตั้งสิทธิ์ครู",
  create_competition: "สร้างรายการแข่งขัน",
  update_competition: "แก้ไขรายการแข่งขัน",
  delete_competition: "ลบรายการแข่งขัน",
  publish: "ประกาศผล",
  unpublish: "ยกเลิกประกาศผล",
  override_register: "ลงทะเบียนแบบ override",
  withdraw_entry: "ยกเลิกการลงทะเบียน",
  record_scores: "บันทึกคะแนน",
};

export default async function AuditPage() {
  await requireAdmin();
  const logs = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(300);

  return (
    <div className="stack">
      <div className="page-header">
        <h1>รายงาน / บันทึกการทำงาน</h1>
        <div className="subtitle">การกระทำสำคัญ 300 รายการล่าสุด</div>
      </div>
      {!logs.length ? (
        <div className="empty-state card"><Icon name="log" size={44} className="empty-ico" /><p>ยังไม่มีบันทึก</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>เวลา</th><th>ผู้ทำ</th><th>การกระทำ</th><th>รายละเอียด</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="text-sm nowrap">{new Date(l.createdAt).toLocaleString("th-TH")}</td>
                  <td className="text-sm">{l.who}</td>
                  <td><span className="badge badge-purple">{ACTION_LABEL[l.action] ?? l.action}</span></td>
                  <td className="text-xs muted" style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }}>{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
