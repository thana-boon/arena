import Link from "next/link";
import { Icon } from "@/components/Icon";
import { db } from "@/db";
import { competitions, entries, entryMembers } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getActiveYearWithSettings } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const { year, setting } = await getActiveYearWithSettings();

  let compCount = 0;
  let publishedCount = 0;
  let entryCount = 0;
  let studentCount = 0;

  if (year) {
    const comps = await db.select().from(competitions).where(eq(competitions.yearId, year.id));
    compCount = comps.length;
    publishedCount = comps.filter((c) => c.isPublished).length;
    if (comps.length) {
      const compIds = comps.map((c) => c.id);
      const ents = await db
        .select()
        .from(entries)
        .where(and(inArray(entries.competitionId, compIds), eq(entries.status, "active")));
      entryCount = ents.length;
      if (ents.length) {
        const members = await db
          .select()
          .from(entryMembers)
          .where(inArray(entryMembers.entryId, ents.map((e) => e.id)));
        studentCount = new Set(members.map((m) => m.studentCode)).size;
      }
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>แดชบอร์ด</h1>
        <div className="subtitle">
          {year ? `ปีการศึกษา ${year.yearBe}` : "ยังไม่มีปีการศึกษาที่เปิดใช้งาน"}
          {setting && ` · ${setting.registrationOpen ? "เปิดรับสมัคร" : "ปิดรับสมัคร"}`}
        </div>
      </div>

      {!year ? (
        <div className="alert alert-warning">
          ยังไม่มีปีการศึกษาที่เปิดใช้งาน — <Link href="/admin/years">ไปตั้งค่าปีการศึกษา</Link>
        </div>
      ) : (
        <>
          <div className="grid-4 stagger">
            <div className="stat-card">
              <div className="label">รายการแข่งขัน</div>
              <div className="value">{compCount}</div>
            </div>
            <div className="stat-card">
              <div className="label">ประกาศผลแล้ว</div>
              <div className="value">{publishedCount}</div>
            </div>
            <div className="stat-card">
              <div className="label">ยอดลงทะเบียน (entry)</div>
              <div className="value">{entryCount}</div>
            </div>
            <div className="stat-card">
              <div className="label">นักเรียนที่เข้าร่วม</div>
              <div className="value">{studentCount}</div>
            </div>
          </div>

          <div className="grid-3 mt-4 stagger">
            <Link href="/admin/competitions" className="card">
              <h3><Icon name="trophy" size={22} /> จัดการรายการแข่งขัน</h3>
              <p className="muted text-sm mb-0">ดู/เผยแพร่/แก้ไขรายการทั้งหมด</p>
            </Link>
            <Link href="/admin/settings" className="card">
              <h3><Icon name="settings" size={22} /> ตั้งค่าการรับสมัคร</h3>
              <p className="muted text-sm mb-0">เปิด-ปิด, ช่วงเวลา, เกณฑ์เหรียญ</p>
            </Link>
            <Link href="/admin/teachers" className="card">
              <h3><Icon name="user" size={22} /> สิทธิ์ครู</h3>
              <p className="muted text-sm mb-0">มอบสิทธิ์ admin / ผู้บันทึกผล</p>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
