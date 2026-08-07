import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CompTypeBadge } from "@/components/CompTypeBadge";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { events } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getActiveYearWithSettings } from "@/lib/queries";
import { getStudentEntries } from "@/lib/student";
import { formatThaiDate, registrationNotice, registrationWindow } from "@/lib/domain";
import { RegWindowNotice } from "@/components/RegWindowNotice";
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

  // ช่วงรับสมัครเป็นของ "งาน" ไม่ใช่ของปีการศึกษา
  // แถบสถานะด้านบนพูดถึงเฉพาะงานที่เปิดให้นักเรียน แต่ปุ่มยกเลิกต้องเทียบกับงานจริงของรายการนั้น
  // (ครูลงชื่อให้ในงานที่ยังไม่เปิดให้นักเรียนได้ — ถ้าใช้แค่งานที่มองเห็น จะขึ้นเหตุผลผิด)
  const eventRows = await db
    .select({
      id: events.id,
      name: events.name,
      visibleToStudents: events.visibleToStudents,
      registrationOpen: events.registrationOpen,
      regStart: events.regStart,
      regEnd: events.regEnd,
    })
    .from(events)
    .where(eq(events.yearId, year.id))
    .orderBy(asc(events.name));
  const eventById = new Map(eventRows.map((e) => [e.id, e]));
  const visibleEvents = eventRows.filter((e) => e.visibleToStudents);
  const notice = registrationNotice(visibleEvents);
  // ยกเลิกเองได้เฉพาะตอนงานของรายการนั้นยังเปิดรับสมัคร (เกณฑ์เดียวกับฝั่งครูประจำชั้น)
  const entryWindow = (eventId: number | null) =>
    registrationWindow(eventId == null ? null : eventById.get(eventId));

  return (
    <div className="stack">
      <div className="page-header">
        <h1>สวัสดี {session.name}</h1>
        <div className="subtitle">
          {session.classLevel}/{session.classRoom} · ปีการศึกษา {year.yearBe}
        </div>
      </div>

      {/* บอกสถานะรับสมัครตั้งแต่หน้าแรก ไม่ต้องกดเข้าไปหน้าเลือกรายการก่อนถึงจะรู้ว่าหมดเวลา */}
      <RegWindowNotice events={visibleEvents} />

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
          <Icon name="clipboard" size={28} style={{ color: "var(--skdw-purple)" }} />
          <div style={{ fontWeight: 600, color: "var(--skdw-purple)", marginTop: 4 }}>
            {notice.open ? "เลือกลงทะเบียน" : "ดูรายการแข่งขัน"}
          </div>
        </Link>
      </div>

      <h2 className="mt-4">รายการที่ลงทะเบียน</h2>
      {!entries.length ? (
        <div className="empty-state card">
          <Icon name="clipboard" size={44} className="empty-ico" />
          <p>ยังไม่มีรายการที่ลงทะเบียน</p>
          {notice.open && <Link href="/student/browse" className="btn btn-primary mt-4">เลือกลงทะเบียน</Link>}
        </div>
      ) : (
        <div className="stack">
          {entries.map((e) => {
            const w = entryWindow(e.eventId);
            return (
            <div key={e.entryId} className="card">
              <div className="row between">
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="badge badge-purple">{e.groupName}</span>
                    {/* ทีมที่ลงไปแล้ว — บอกจำนวนคนจริงในทีม ไม่ใช่ช่วงที่รายการกำหนด */}
                    <CompTypeBadge
                      type={e.type === "team" ? "team" : "individual"}
                      teamSizeMin={e.members.length}
                      teamSizeMax={e.members.length}
                      size="sm"
                    />
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
                  {e.venues.length > 0 && (
                    <div className="text-sm muted row" style={{ gap: 4, marginTop: 2 }}>
                      <Icon name="pin" size={13} />
                      <span>{e.venues.join(", ")}</span>
                    </div>
                  )}
                </div>
                <WithdrawButton
                  entryId={e.entryId}
                  disabled={!w.open}
                  disabledReason={w.reason ?? undefined}
                />
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
