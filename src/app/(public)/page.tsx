import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CompTypeBadge } from "@/components/CompTypeBadge";
import { db } from "@/db";
import { competitions, subjectGroups } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getDefaultEvent } from "@/lib/queries";
import { competitionAllowedLevels } from "@/lib/results";
import { formatThaiDate, formatLevels, minClassLevelIndex } from "@/lib/domain";

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
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const groupName = (id: number | null) => (id == null ? "ทั่วไป" : groupById.get(id)?.name ?? "-");
  // ลำดับหมวดตามที่แอดมินจัดไว้ (รายการที่ไม่ระบุหมวด → ไปท้ายสุด) เหมือนหน้าลงทะเบียนของนักเรียน
  const groupSort = (id: number | null) => (id == null ? 9999 : groupById.get(id)?.sortOrder ?? 9998);

  // จัดเป็นชุดตามหมวด แล้วในหมวดไล่ระดับชั้นจากเล็กไปโต (เตรียมอนุบาล → อ. → ป. → ม.) → ชื่อรายการ
  // คนทั่วไปกวาดตาหารายการจากหมวดก่อน แล้วค่อยไล่ชั้น ไม่ได้ไล่ตามลำดับที่สร้าง
  const sections = [
    ...comps
      .reduce((map, c) => {
        const gid = c.subjectGroupId ?? -1;
        const s = map.get(gid) ?? { id: gid, name: groupName(c.subjectGroupId), sortOrder: groupSort(c.subjectGroupId), items: [] };
        s.items.push(c);
        map.set(gid, s);
        return map;
      }, new Map<number, { id: number; name: string; sortOrder: number; items: typeof comps }>())
      .values(),
  ];
  for (const s of sections) {
    s.items.sort(
      (a, b) =>
        minClassLevelIndex(competitionAllowedLevels(a)) - minClassLevelIndex(competitionAllowedLevels(b)) ||
        a.name.localeCompare(b.name, "th")
    );
  }
  sections.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "th"));

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
          {sections.map((s) => (
            <section key={s.id} className="stack" style={{ gap: "var(--space-3)" }}>
              <div className="group-head">
                <Icon name="book" size={16} />
                <h2>{s.name}</h2>
                <span className="n">{s.items.length} รายการ</span>
              </div>
              <div className="grid-3 stagger">
                {s.items.map((c) => (
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
                      ระดับชั้น: {formatLevels(competitionAllowedLevels(c)) || "-"}
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
            </section>
          ))}
        </>
      )}
    </div>
  );
}
