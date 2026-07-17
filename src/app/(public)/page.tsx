import Link from "next/link";
import { Icon } from "@/components/Icon";
import { db } from "@/db";
import { competitions, subjectGroups } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getActiveYear } from "@/lib/queries";
import { competitionAllowedLevels } from "@/lib/results";
import { formatThaiDate } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const year = await getActiveYear();

  let comps: (typeof competitions.$inferSelect)[] = [];
  let groups: (typeof subjectGroups.$inferSelect)[] = [];
  if (year) {
    comps = await db
      .select()
      .from(competitions)
      .where(and(eq(competitions.yearId, year.id), eq(competitions.isPublished, true)));
    groups = await db.select().from(subjectGroups).where(eq(subjectGroups.yearId, year.id));
  }
  const groupName = (id: number | null) => (id == null ? "ทั่วไป" : groups.find((g) => g.id === id)?.name ?? "-");

  return (
    <div className="stack">
      <div className="page-header">
        <h2>รายการแข่งขันที่เปิดประกาศ</h2>
      </div>

      {!comps.length ? (
        <div className="empty-state card">
          <Icon name="trophy" size={44} className="empty-ico" />
          <p>ยังไม่มีรายการแข่งขันที่ประกาศ</p>
          <p className="text-sm">โปรดกลับมาตรวจสอบอีกครั้งในภายหลัง</p>
        </div>
      ) : (
        <div className="grid-3 stagger">
          {comps.map((c) => (
            <div key={c.id} className="card">
              <div className="row between mb-2">
                <span className="badge badge-purple">{groupName(c.subjectGroupId)}</span>
                <span className="badge">{c.type === "team" ? "ทีม" : "เดี่ยว"}</span>
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
              <Link href={`/results#comp-${c.id}`} className="btn btn-ghost btn-sm mt-4">
                ดูรายละเอียด
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
