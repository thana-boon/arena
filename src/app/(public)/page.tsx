import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CompTypeBadge } from "@/components/CompTypeBadge";
import { db } from "@/db";
import { competitions, subjectGroups } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getDefaultEvent } from "@/lib/queries";
import { competitionAllowedLevels } from "@/lib/results";
import { formatThaiDate } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { year, setting, event } = await getDefaultEvent();

  let comps: (typeof competitions.$inferSelect)[] = [];
  let groups: (typeof subjectGroups.$inferSelect)[] = [];
  if (year) {
    // ประกาศเฉพาะ "งานเริ่มต้น" ที่ admin เลือกไว้ในหน้าตั้งค่า (ถ้ายังไม่ได้เลือก จะแสดงทุกงานของปีนั้น)
    const conds = [eq(competitions.yearId, year.id), eq(competitions.isPublished, true)];
    if (setting?.defaultEventId != null) conds.push(eq(competitions.eventId, setting.defaultEventId));
    comps = await db
      .select()
      .from(competitions)
      .where(and(...conds));
    groups = await db.select().from(subjectGroups).where(eq(subjectGroups.yearId, year.id));
  }
  const groupName = (id: number | null) => (id == null ? "ทั่วไป" : groups.find((g) => g.id === id)?.name ?? "-");

  return (
    <div className="stack">
      <div className="page-header">
        <h1>ประกาศผลการแข่งขัน</h1>
        <div className="subtitle">
          {event ? `${event.name} · ` : ""}
          {year ? `ปีการศึกษา ${year.yearBe}` : ""}
        </div>
      </div>

      {!comps.length ? (
        <div className="empty-state card">
          <Icon name="trophy" size={44} className="empty-ico" />
          <p>ยังไม่มีการประกาศผลการแข่งขัน</p>
          <p className="text-sm">เมื่อกรรมการบันทึกคะแนนเรียบร้อยแล้ว ผลจะขึ้นที่หน้านี้</p>
        </div>
      ) : (
        <>
          {/* ทางเข้าหลักของหน้านี้ — คนทั่วไปเข้ามาเพื่อ "ดูผล" ไม่ใช่มาอ่านรายชื่อรายการ */}
          <div className="card home-lead">
            <div>
              <h2>ดูคะแนนและรางวัลของทุกรายการ</h2>
              <p className="muted">
                ค้นหาชื่อนักเรียนหรือชื่อรายการ เพื่อดูคะแนน อันดับ และเหรียญรางวัลที่ได้รับ
              </p>
            </div>
            <Link href="/results" className="btn btn-primary">
              <Icon name="trophy" size={16} />
              ดูผลการแข่งขัน
            </Link>
          </div>

          <h2 className="section-title">รายการแข่งขันในงานนี้ ({comps.length} รายการ)</h2>
          <div className="grid-3 stagger">
            {comps.map((c) => (
              <div key={c.id} className="card">
                <div className="row between mb-2">
                  <span className="badge badge-purple">{groupName(c.subjectGroupId)}</span>
                  <CompTypeBadge
                    type={c.type === "team" ? "team" : "individual"}
                    teamSizeMin={c.teamSizeMin}
                    teamSizeMax={c.teamSizeMax}
                    size="sm"
                  />
                </div>
                <h3 style={{ fontSize: "var(--text-lg)" }}>{c.name}</h3>
                <div className="text-sm muted">
                  ระดับชั้น: {competitionAllowedLevels(c).join(", ") || "-"}
                </div>
                {c.eventDate && (
                  <div className="text-sm muted">
                    วันแข่ง: {formatThaiDate(c.eventDate)} {c.startTime?.slice(0, 5)}–{c.endTime?.slice(0, 5)}
                  </div>
                )}
                {/* รายการที่ "ไม่มีการแข่งขัน" ไม่มีผลให้ดู — หน้า /results ก็ตัดออกอยู่แล้ว */}
                {c.noContest ? (
                  <div className="text-sm muted mt-4">กิจกรรมนี้ไม่มีการแข่งขัน จึงไม่มีผลประกาศ</div>
                ) : (
                  <Link href={`/results#comp-${c.id}`} className="btn btn-ghost btn-sm mt-4">
                    ดูผลรายการนี้
                  </Link>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
