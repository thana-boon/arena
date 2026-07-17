"use client";
import Link from "next/link";
import { Icon } from "@/components/Icon";

type EventRow = {
  id: number;
  name: string;
  kind: string;
  eventDate: string | null;
  status: string;
  visibleToStudents: boolean;
  registrationOpen: boolean;
  competitionCount: number;
  issuedCount: number;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "ฉบับร่าง",
  published: "เผยแพร่แล้ว",
  locked: "ล็อก (ออกใบแล้ว)",
};
const STATUS_CLASS: Record<string, string> = {
  draft: "badge",
  published: "badge-gold",
  locked: "badge-purple",
};

export function CertEventsManager({ events }: { events: EventRow[] }) {
  return (
    <div className="stack">
      <div className="alert alert-info">
        สร้าง/แก้ไขงานได้ที่เมนู <strong>ตั้งค่า</strong> — หน้านี้ไว้ <strong>ออกแบบเกียรติบัตร</strong> ของแต่ละงาน (พื้นหลัง/ลายเซ็น/ตำแหน่งข้อความ)
      </div>

      {events.length === 0 ? (
        <div className="empty-state card">
          <Icon name="file" size={44} className="empty-ico" />
          <p>ยังไม่มีงาน — สร้างงานที่เมนู“ตั้งค่า”</p>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>ชื่องาน</th>
                <th>สถานะ</th>
                <th style={{ textAlign: "center" }}>รายการแข่งขัน</th>
                <th style={{ textAlign: "center" }}>ออกแล้ว</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`/admin/certificates/${e.id}`} className="link">{e.name}</Link>
                    <div className="row" style={{ gap: 6, marginTop: 4 }}>
                      <span className="badge">{e.kind === "training" ? "อบรม" : "แข่งขัน"}</span>
                      {e.visibleToStudents && <span className="badge badge-purple">นักเรียนเห็น</span>}
                      {e.registrationOpen && <span className="badge badge-gold">เปิดรับสมัคร</span>}
                    </div>
                  </td>
                  <td><span className={STATUS_CLASS[e.status] ?? "badge"}>{STATUS_LABEL[e.status] ?? e.status}</span></td>
                  <td style={{ textAlign: "center" }}>{e.competitionCount}</td>
                  <td style={{ textAlign: "center" }}>{e.issuedCount}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link href={`/admin/certificates/${e.id}`} className="btn btn-sm">ออกแบบเกียรติบัตร</Link>
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
