import Link from "next/link";
import { Icon } from "@/components/Icon";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/db";
import { competitions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getActiveYearWithSettings } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function TeacherHome() {
  const session = await requireStaff();
  const { year, setting } = await getActiveYearWithSettings();

  let mine = 0;
  let total = 0;
  if (year) {
    const all = await db.select().from(competitions).where(eq(competitions.yearId, year.id));
    total = all.length;
    mine = all.filter((c) => c.createdBy === session.code).length;
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>สวัสดี {session.name}</h1>
        <div className="subtitle">
          {year ? `ปีการศึกษา ${year.yearBe}` : "ยังไม่เปิดปีการศึกษา"}
          {setting && ` · ${setting.registrationOpen ? "เปิดรับสมัคร" : "ปิดรับสมัคร"}`}
          {(session.role === "recorder" || session.role === "admin") && " · มีสิทธิ์บันทึกผล"}
        </div>
      </div>

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

      <div className="row">
        <Link href="/teacher/competitions" className="btn btn-primary">ดูรายการแข่งขัน</Link>
        {(session.role === "recorder" || session.role === "admin") && (
          <Link href="/teacher/scoring" className="btn btn-secondary">บันทึกผลการแข่งขัน</Link>
        )}
      </div>
    </div>
  );
}
