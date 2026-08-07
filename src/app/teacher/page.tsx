import Link from "next/link";
import { Icon } from "@/components/Icon";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/db";
import { competitions, events } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getActiveYearWithSettings } from "@/lib/queries";
import { registrationNotice } from "@/lib/domain";
import { RegWindowNotice } from "@/components/RegWindowNotice";

export const dynamic = "force-dynamic";

export default async function TeacherHome() {
  const session = await requireStaff();
  const { year } = await getActiveYearWithSettings();

  let mine = 0;
  let total = 0;
  if (year) {
    const all = await db.select().from(competitions).where(eq(competitions.yearId, year.id));
    total = all.length;
    mine = all.filter((c) => c.createdBy === session.code).length;
  }

  // สถานะรับสมัครเป็นของ "งาน" ไม่ใช่ของปีการศึกษา — เดิมหัวข้อหน้านี้อ่านสวิตช์ระดับปีที่เลิกใช้แล้ว
  const eventRows = year
    ? await db
        .select({
          name: events.name,
          registrationOpen: events.registrationOpen,
          regStart: events.regStart,
          regEnd: events.regEnd,
        })
        .from(events)
        .where(eq(events.yearId, year.id))
        .orderBy(asc(events.name))
    : [];
  const notice = registrationNotice(eventRows);

  return (
    <div className="stack">
      <div className="page-header">
        <h1>สวัสดี {session.name}</h1>
        <div className="subtitle">
          {year ? `ปีการศึกษา ${year.yearBe}` : "ยังไม่เปิดปีการศึกษา"}
          {year && ` · ${notice.title}`}
          {(session.role === "recorder" || session.role === "admin") && " · มีสิทธิ์บันทึกผล"}
        </div>
      </div>

      {year && <RegWindowNotice events={eventRows} />}

      <div className="grid-3 stagger">
        <div className="stat-card">
          <div className="label">รายการที่ฉันสร้าง</div>
          <div className="value">{mine}</div>
        </div>
        <div className="stat-card">
          <div className="label">รายการทั้งหมดในปีนี้</div>
          <div className="value">{total}</div>
        </div>
        <Link href="/teacher/competitions/new" className="stat-card" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Icon name="plus" size={28} style={{ color: "var(--skdw-purple)" }} />
          <div style={{ fontWeight: 600, color: "var(--skdw-purple)", marginTop: 4 }}>สร้างรายการแข่งขัน</div>
        </Link>
      </div>

      <div className="page-actions">
        {/* งานหลักของครูประจำชั้น — ปุ่มแรกสุด กดถึงได้ทันทีตั้งแต่หน้าแรกบนมือถือ */}
        <Link href="/teacher/class-registrations" className="btn btn-primary">
          <Icon name="graduation" size={18} /> สมัครให้ห้องประจำชั้น
        </Link>
        <Link href="/teacher/competitions" className="btn btn-secondary">ดูรายการแข่งขัน</Link>
        {(session.role === "recorder" || session.role === "admin") && (
          <Link href="/teacher/scoring" className="btn btn-ghost">บันทึกผลการแข่งขัน</Link>
        )}
      </div>
    </div>
  );
}
