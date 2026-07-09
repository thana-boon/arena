import Link from "next/link";
import { Icon } from "@/components/Icon";
import { db } from "@/db";
import { competitions, criteria, subjectGroups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseJsonArray, formatThaiDate, formatSeats } from "@/lib/domain";
import { canScore, canViewCompetition } from "@/lib/permit";
import { getRoster, getCapacityRows } from "@/lib/roster";
import type { SessionPayload } from "@/lib/auth/session";
import { RosterManager } from "@/app/teacher/competitions/[id]/RosterManager";

/**
 * เนื้อหาหน้าจัดการรายการแข่งขัน — ใช้ร่วมกันทั้งฝั่งครู (/teacher) และ admin (/admin)
 * เพื่อให้เมนู/เลย์เอาต์คงบริบทของ role ที่เข้ามา (แก้ปัญหา navbar สลับเป็นของครู)
 */
export async function CompetitionDetailBody({
  id,
  session,
  basePath,
  scoreBasePath,
}: {
  id: number;
  session: SessionPayload;
  basePath: string;
  scoreBasePath: string;
}) {
  const comp = (await db.select().from(competitions).where(eq(competitions.id, id)).limit(1))[0];
  if (!comp) return <div className="alert alert-error">ไม่พบรายการแข่งขัน</div>;
  const group = (await db.select().from(subjectGroups).where(eq(subjectGroups.id, comp.subjectGroupId)).limit(1))[0];
  if (!canViewCompetition(session, comp.createdBy, group?.catalogNo))
    return <div className="alert alert-error">คุณไม่มีสิทธิ์เข้าถึงรายการนี้</div>;

  const crits = await db.select().from(criteria).where(eq(criteria.competitionId, id));
  const fullScore = crits.reduce((s, c) => s + Number(c.maxScore), 0);
  const roster = await getRoster(id);
  const caps = await getCapacityRows(id);
  const levels = parseJsonArray(comp.allowedClassLevels);
  const eventDateTh = formatThaiDate(comp.eventDate);

  return (
    <div className="stack">
      <div className="row between">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>{comp.name}</h1>
          <div className="subtitle">
            {group?.name} · {comp.type === "team" ? `ทีม ${comp.teamSizeMin}-${comp.teamSizeMax} คน` : "เดี่ยว"} · คะแนนเต็ม {fullScore}
            {eventDateTh && ` · ${eventDateTh}${comp.startTime ? ` ${comp.startTime.slice(0, 5)}–${comp.endTime?.slice(0, 5)} น.` : ""}`}
          </div>
        </div>
        <div className="row">
          <Link href={`${basePath}/${id}/reports`} className="btn btn-ghost"><Icon name="printer" size={18} /> เอกสาร</Link>
          <Link href={`${basePath}/${id}/edit`} className="btn btn-secondary">แก้ไข</Link>
          {canScore(session) && <Link href={`${scoreBasePath}/${id}`} className="btn btn-primary">บันทึกผล</Link>}
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ padding: 0, border: "none", marginBottom: 12 }}>ที่นั่ง</div>
        <div className="row">
          {comp.type === "individual" && comp.capacityMode === "combined" ? (
            (() => {
              const c = caps.find((x) => x.classLevel === null);
              return (
                <div className="badge badge-purple" style={{ fontSize: "var(--text-sm)", padding: "6px 12px" }}>
                  รวมทุกชั้น ({levels.join(", ")}): {formatSeats(c?.registeredCount ?? 0, c?.capacity)}
                </div>
              );
            })()
          ) : comp.type === "individual" ? (
            levels.map((lv) => {
              const c = caps.find((x) => x.classLevel === lv);
              return (
                <div key={lv} className="badge badge-purple" style={{ fontSize: "var(--text-sm)", padding: "6px 12px" }}>
                  {lv}: {formatSeats(c?.registeredCount ?? 0, c?.capacity)}
                </div>
              );
            })
          ) : (
            <div className="badge badge-purple" style={{ fontSize: "var(--text-sm)", padding: "6px 12px" }}>
              ทีม: {formatSeats(caps[0]?.registeredCount ?? 0, caps[0]?.capacity)}
            </div>
          )}
        </div>
      </div>

      <RosterManager
        competitionId={id}
        type={comp.type as "individual" | "team"}
        teamSizeMin={comp.teamSizeMin}
        teamSizeMax={comp.teamSizeMax}
        roster={roster}
        canOverride={session.role === "admin"}
        allowedLevels={levels}
      />
    </div>
  );
}
