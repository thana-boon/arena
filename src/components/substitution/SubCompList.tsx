import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { SubCompRow } from "@/lib/substitutions";

/** ชั้นที่สองของหน้าเปลี่ยนตัว — รายการทั้งหมดในงานที่เลือก */
export function SubCompList({
  eventName,
  rows,
  basePath,
  backHref,
}: {
  eventName: string;
  rows: SubCompRow[];
  /** เส้นทางของหน้าเปลี่ยนตัวรายรายการ เช่น "/teacher/substitutions/12" */
  basePath: string;
  backHref: string;
}) {
  return (
    <div className="stack">
      <div className="page-bar">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>{eventName}</h1>
          <div className="subtitle">เลือกรายการที่ต้องการเปลี่ยนตัวผู้เข้าแข่งขัน</div>
        </div>
        <Link href={backHref} className="btn btn-sm">
          <Icon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /> เลือกงานอื่น
        </Link>
      </div>

      {!rows.length ? (
        <div className="empty-state card">
          <Icon name="restore" size={44} className="empty-ico" />
          <p>ยังไม่มีรายการในงานนี้ที่อยู่ในความดูแลของท่าน</p>
        </div>
      ) : (
        <div className="table-wrap table-cards">
          <table className="table">
            <thead>
              <tr>
                <th>รายการแข่งขัน</th>
                <th>หมวด</th>
                <th>ประเภท</th>
                <th className="num">ผู้เข้าแข่งขัน</th>
                <th className="num">เปลี่ยนแล้ว</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="td-title">{r.name}</td>
                  <td data-label="หมวด">{r.groupName || <span className="muted">—</span>}</td>
                  <td data-label="ประเภท">
                    <span className="badge">{r.type === "team" ? "ทีม" : "เดี่ยว"}</span>
                  </td>
                  <td className="num" data-label="ผู้เข้าแข่งขัน">
                    {r.memberCount}
                    {r.type === "team" && <span className="muted text-xs"> ({r.entryCount} ทีม)</span>}
                  </td>
                  <td className="num" data-label="เปลี่ยนแล้ว">
                    {r.subCount > 0 ? `${r.subCount} ครั้ง` : <span className="muted">—</span>}
                  </td>
                  <td className="num td-actions">
                    <div className="row" style={{ justifyContent: "flex-end", gap: 6, flexWrap: "wrap" }}>
                      {!r.allowed && <span className="badge badge-warning">{r.reason}</span>}
                      <Link
                        href={`${basePath}/${r.id}`}
                        className={`btn btn-sm ${r.allowed ? "btn-primary" : ""}`}
                      >
                        <Icon name="restore" size={16} /> {r.allowed ? "เปลี่ยนตัว" : "ดูรายชื่อ"}
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
