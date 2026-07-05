import Link from "next/link";
import { requireRecorderOrAdmin } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { listCompetitions } from "@/lib/listings";

export const dynamic = "force-dynamic";

export default async function ScoringList() {
  await requireRecorderOrAdmin();
  const year = await getActiveYear();
  const comps = year ? await listCompetitions(year.id) : [];

  return (
    <div className="stack">
      <div className="page-header">
        <h1>บันทึกผลการแข่งขัน</h1>
        <div className="subtitle">เลือกรายการเพื่อบันทึกคะแนนและประกาศผล</div>
      </div>
      {!comps.length ? (
        <div className="empty-state card"><div className="big">✏️</div><p>ยังไม่มีรายการแข่งขัน</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>รายการ</th><th>หมวด</th><th>ประเภท</th><th className="num">ผู้เข้าแข่ง</th><th>สถานะ</th><th></th></tr></thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td className="text-sm">{c.groupName}</td>
                  <td><span className="badge">{c.type === "team" ? "ทีม" : "เดี่ยว"}</span></td>
                  <td className="num">{c.activeEntries}</td>
                  <td>{c.isPublished ? <span className="badge badge-success">ประกาศแล้ว</span> : <span className="badge badge-warning">ยังไม่ประกาศ</span>}</td>
                  <td className="num"><Link href={`/teacher/scoring/${c.id}`} className="btn btn-primary btn-sm">บันทึกผล</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
