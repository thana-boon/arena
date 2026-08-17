import Link from "next/link";
import { Icon } from "@/components/Icon";
import { requireStaff } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { listCompetitions } from "@/lib/listings";
import { canScore } from "@/lib/permit";

export const dynamic = "force-dynamic";

export default async function ScoringList() {
  const session = await requireStaff();
  const year = await getActiveYear();
  const all = year ? await listCompetitions(year.id) : [];
  // ครูทั่วไปบันทึกได้เฉพาะรายการในหมวดตัวเอง; admin/recorder เห็นครบทุกรายการ
  // รายการที่ "ไม่มีการแข่งขัน" ก็ขึ้นด้วย — ไม่มีคะแนนให้กรอก แต่ต้องเช็คชื่อผู้เข้าร่วม
  const comps = all.filter((c) => canScore(session, c.createdBy, c.groupCatalogNo));

  return (
    <div className="stack">
      <div className="page-header">
        <h1>บันทึกผลการแข่งขัน</h1>
        <div className="subtitle">เลือกรายการเพื่อบันทึกคะแนนและประกาศผล — รายการที่ไม่มีการแข่งขันให้เช็คชื่อผู้เข้าร่วม</div>
      </div>
      {!comps.length ? (
        <div className="empty-state card"><Icon name="pencil" size={44} className="empty-ico" /><p>ยังไม่มีรายการแข่งขัน</p></div>
      ) : (
        <div className="table-wrap table-cards">
          <table className="table">
            <thead><tr><th>รายการ</th><th>หมวด</th><th>ประเภท</th><th className="num">ผู้เข้าแข่ง</th><th>สถานะ</th><th></th></tr></thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.id}>
                  <td className="td-title" style={{ fontWeight: 500 }}>{c.name}</td>
                  <td className="text-sm" data-label="หมวด">{c.groupName}</td>
                  <td data-label="ประเภท">
                    <span className="badge">{c.type === "team" ? "ทีม" : "เดี่ยว"}</span>
                    {c.noContest && <span className="badge badge-purple" style={{ marginLeft: 4 }}>ไม่มีการแข่งขัน</span>}
                  </td>
                  <td className="num" data-label="ผู้เข้าแข่ง">{c.activeEntries}</td>
                  {/* ไม่มีการแข่งขัน = ไม่มีผลให้ประกาศ สถานะที่ครูต้องรู้คือ "เช็คชื่อแล้วหรือยัง" */}
                  <td data-label="สถานะ">
                    {c.noContest
                      ? c.attendanceChecked
                        ? <span className="badge badge-success">เช็คชื่อแล้ว</span>
                        : <span className="badge badge-warning">ยังไม่เช็คชื่อ</span>
                      : c.isPublished
                        ? <span className="badge badge-success">ประกาศแล้ว</span>
                        : <span className="badge badge-warning">ยังไม่ประกาศ</span>}
                  </td>
                  <td className="num td-actions">
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      <Link href={`/teacher/scoring/${c.id}`} className="btn btn-primary btn-sm">
                        {c.noContest ? "เช็คชื่อ" : "บันทึกผล"}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
