import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { getActiveYearWithSettings } from "@/lib/queries";
import { getStudentEntries } from "@/lib/student";
import { formatThaiDate } from "@/lib/domain";
import { WithdrawButton } from "./WithdrawButton";

export const dynamic = "force-dynamic";

export default async function StudentDashboard() {
  const session = await requireRole("student");
  const { year, setting } = await getActiveYearWithSettings();
  if (!year || !setting) {
    return <div className="alert alert-warning">ยังไม่เปิดปีการศึกษา</div>;
  }
  const entries = await getStudentEntries(session.code, year.id);
  const max = setting.maxEntriesPerStudent;
  const remaining = Math.max(0, max - entries.length);

  return (
    <div className="stack">
      <div className="page-header">
        <h1>สวัสดี {session.name}</h1>
        <div className="subtitle">
          {session.classLevel}/{session.classRoom} · ปีการศึกษา {year.yearBe}
        </div>
      </div>

      <div className="grid-3 stagger">
        <div className="stat-card">
          <div className="label">ลงทะเบียนแล้ว</div>
          <div className="value">{entries.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">ลงได้อีก</div>
          <div className="value">{remaining}</div>
          <div className="text-xs muted">จากทั้งหมด {max} รายการ</div>
        </div>
        <Link href="/student/browse" className="stat-card" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 28 }}>📝</div>
          <div style={{ fontWeight: 600, color: "var(--skdw-purple)" }}>
            {setting.registrationOpen ? "เลือกลงทะเบียน" : "ดูรายการแข่งขัน"}
          </div>
        </Link>
      </div>

      <h2 className="mt-4">รายการที่ลงทะเบียน</h2>
      {!entries.length ? (
        <div className="empty-state card">
          <div className="big">📋</div>
          <p>ยังไม่มีรายการที่ลงทะเบียน</p>
          {setting.registrationOpen && <Link href="/student/browse" className="btn btn-primary mt-4">เลือกลงทะเบียน</Link>}
        </div>
      ) : (
        <div className="stack">
          {entries.map((e) => (
            <div key={e.entryId} className="card">
              <div className="row between">
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="badge badge-purple">{e.groupName}</span>
                    <span className="badge">{e.type === "team" ? "ทีม" : "เดี่ยว"}</span>
                  </div>
                  <h3 style={{ margin: "8px 0 4px" }}>{e.competitionName}</h3>
                  {e.type === "team" && (
                    <div className="text-sm">
                      {e.teamName && <strong>{e.teamName} · </strong>}
                      {e.members.map((m) => m.name).join(", ")}
                    </div>
                  )}
                  {e.eventDate && (
                    <div className="text-sm muted">
                      {formatThaiDate(e.eventDate)} {e.startTime?.slice(0, 5)}–{e.endTime?.slice(0, 5)}
                    </div>
                  )}
                </div>
                <WithdrawButton entryId={e.entryId} disabled={!setting.registrationOpen} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
