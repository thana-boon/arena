import Link from "next/link";
import { db } from "@/db";
import { competitions, criteria, scores, subjectGroups } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getActiveYearWithSettings } from "@/lib/queries";
import { getRoster } from "@/lib/roster";
import { canScore } from "@/lib/permit";
import { formatThaiDateTime } from "@/lib/domain";
import type { SessionPayload } from "@/lib/auth/session";
import { ScoringGrid } from "@/app/teacher/scoring/[id]/ScoringGrid";
import { AttendanceGrid } from "@/app/teacher/scoring/[id]/AttendanceGrid";

/**
 * เนื้อหาหน้าบันทึกผล — ใช้ร่วมกันทั้ง /teacher และ /admin (ต่างกันแค่ปลายทาง backHref)
 *
 * รายการที่ "ไม่มีการแข่งขัน" เข้าหน้าเดียวกันนี้ แต่ได้ตารางเช็คชื่อผู้เข้าร่วมแทนตารางคะแนน
 * (ครูจำได้ทางเดียวว่า "บันทึกผล" อยู่ไหน — ไม่ต้องมีเมนูที่สองให้หลง)
 */
export async function ScoringBody({
  id,
  session,
  backHref,
}: {
  id: number;
  session: SessionPayload;
  /** ปลายทางปุ่มย้อนกลับ — หน้าเลือกรายการที่จะบันทึกผล (คงบริบท /teacher หรือ /admin) */
  backHref: string;
}) {
  // ปุ่มย้อนกลับต้องมีทุกทาง รวมทั้งหน้าที่จบด้วย alert — ไม่งั้นครูติดอยู่หน้านั้น เลือกรายการใหม่ไม่ได้
  const back = (
    <div>
      <Link href={backHref} className="btn btn-ghost btn-sm">← กลับไปเลือกรายการ</Link>
    </div>
  );
  const withBack = (node: React.ReactNode) => (
    <div className="stack">
      {back}
      {node}
    </div>
  );

  const { setting } = await getActiveYearWithSettings();
  const comp = (await db.select().from(competitions).where(eq(competitions.id, id)).limit(1))[0];
  if (!comp) return withBack(<div className="alert alert-error">ไม่พบรายการแข่งขัน</div>);
  const group = comp.subjectGroupId == null ? undefined : (await db.select().from(subjectGroups).where(eq(subjectGroups.id, comp.subjectGroupId)).limit(1))[0];
  if (!canScore(session, comp.createdBy, group?.catalogNo))
    return withBack(<div className="alert alert-error">บันทึกคะแนนได้เฉพาะรายการในหมวดของท่าน</div>);
  // ไม่มีการแข่งขัน = ไม่มีคะแนนให้กรอก เหลือแค่ "มาร่วมกิจกรรมจริงไหม" → เช็คชื่อรายคน
  if (comp.noContest) {
    const roster = await getRoster(id);
    return (
      <div className="stack">
        {back}
        <div className="page-header">
          <h1>เช็คชื่อผู้เข้าร่วม: {comp.name}</h1>
          <div className="subtitle">
            ไม่มีการแข่งขัน · {comp.type === "team" ? "ประเภททีม" : "ประเภทเดี่ยว"} · ไม่มีคะแนน/อันดับ/รางวัล
          </div>
        </div>
        <AttendanceGrid
          competitionId={id}
          type={comp.type as "individual" | "team"}
          roster={roster}
          checkedAtText={comp.attendanceCheckedAt ? formatThaiDateTime(comp.attendanceCheckedAt) : null}
        />
      </div>
    );
  }

  const crits = await db.select().from(criteria).where(eq(criteria.competitionId, id));
  crits.sort((a, b) => a.sortOrder - b.sortOrder);
  const roster = await getRoster(id);

  const entryIds = roster.map((r) => r.entryId);
  const existingScores = entryIds.length
    ? await db.select().from(scores).where(inArray(scores.entryId, entryIds))
    : [];
  const scoreMap: Record<string, number> = {};
  for (const s of existingScores) scoreMap[`${s.entryId}:${s.criterionId}`] = Number(s.score);

  return (
    <div className="stack">
      {back}
      <div className="page-header">
        <h1>บันทึกผล: {comp.name}</h1>
        <div className="subtitle">
          {comp.type === "team" ? "ประเภททีม" : "ประเภทเดี่ยว"} · เกณฑ์เหรียญ ทอง {setting?.medalGoldPct}% / เงิน {setting?.medalSilverPct}% / ทองแดง {setting?.medalBronzePct}%
        </div>
      </div>
      <ScoringGrid
        competitionId={id}
        isPublished={comp.isPublished}
        type={comp.type as "individual" | "team"}
        criteria={crits.map((c) => ({ id: c.id, name: c.name, max: Number(c.maxScore) }))}
        roster={roster}
        initialScores={scoreMap}
        medalPct={{
          gold: setting?.medalGoldPct ?? 80,
          silver: setting?.medalSilverPct ?? 70,
          bronze: setting?.medalBronzePct ?? 60,
        }}
      />
    </div>
  );
}
