import Link from "next/link";
import { db } from "@/db";
import { competitions, criteria, scores } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getActiveYearWithSettings } from "@/lib/queries";
import { getRoster } from "@/lib/roster";
import { canScore } from "@/lib/permit";
import { competitionCatalogNos } from "@/lib/competitionGroups";
import { formatThaiDateTime, MANUAL_TEACHER_PREFIX } from "@/lib/domain";
import type { SessionPayload } from "@/lib/auth/session";
import { ScoringGrid } from "@/app/teacher/scoring/[id]/ScoringGrid";
import { AttendanceGrid } from "@/app/teacher/scoring/[id]/AttendanceGrid";
import { TeacherPicker, type TeacherOption } from "@/app/teacher/scoring/[id]/TeacherPicker";
import { fetchAllTeachers, normalizeTeacherCode, teacherFullName } from "@/lib/external/teacher-api";
import { getSubjectGroupMap, subjectGroupLabel } from "@/lib/subjectGroups";

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
  // เลขหมวดทั้งหมด (หลัก + ร่วม) — ครูในหมวดร่วมบันทึกคะแนน/เช็คชื่อรายการนี้ได้เหมือนหมวดเจ้าของ
  const groupNos = await competitionCatalogNos(comp.id, comp.subjectGroupId);
  if (!canScore(session, comp.createdBy, groupNos))
    return withBack(<div className="alert alert-error">บันทึกคะแนนได้เฉพาะรายการในหมวดของท่าน</div>);
  // กิจกรรมของครู: ไม่มีใครสมัครเอง — ติ๊กจากรายชื่อครูทั้งโรงเรียน (ลงทะเบียน + เช็คชื่อในขั้นเดียว)
  if (comp.participantType === "teacher") {
    const roster = await getRoster(id);
    const members = roster.flatMap((e) => e.members);
    const pickedCodes = members.filter((m) => !m.absent).map((m) => normalizeTeacherCode(m.studentCode));
    let teachers: TeacherOption[] = [];
    let loadError = false;
    try {
      const [list, groupMap] = await Promise.all([fetchAllTeachers(), getSubjectGroupMap()]);
      teachers = list.map((t) => ({
        code: normalizeTeacherCode(t.teacher_code),
        name: teacherFullName(t),
        group: t.subject_group == null ? "" : subjectGroupLabel(Number(t.subject_group), groupMap),
      }));
    } catch {
      loadError = true; // SchoolOS ล่ม — ยังโชว์คนที่ติ๊กไว้แล้วได้ (เอาติ๊กออกได้ แต่เพิ่มใหม่ไม่ได้)
    }
    // คนที่เคยติ๊กไว้แต่ไม่อยู่ในรายชื่อปัจจุบันแล้ว (ลาออก/ย้าย) — ต้องยังเห็นและเอาติ๊กออกได้
    const known = new Set(teachers.map((t) => t.code));
    for (const m of members) {
      const code = normalizeTeacherCode(m.studentCode);
      if (!known.has(code)) {
        const manual = code.startsWith(MANUAL_TEACHER_PREFIX);
        teachers.push({ code, name: m.name, group: "", manual, inactive: !manual && !loadError });
        known.add(code);
      }
    }
    teachers.sort((a, b) => a.group.localeCompare(b.group, "th") || a.name.localeCompare(b.name, "th"));
    return (
      <div className="stack">
        {back}
        <div className="page-header">
          <h1>ติ๊กรายชื่อครู: {comp.name}</h1>
          <div className="subtitle">กิจกรรมของครู · ไม่มีคะแนน/อันดับ/รางวัล</div>
        </div>
        <TeacherPicker
          competitionId={id}
          teachers={teachers}
          initialCodes={pickedCodes}
          checkedAtText={comp.attendanceCheckedAt ? formatThaiDateTime(comp.attendanceCheckedAt) : null}
          loadError={loadError}
          // ปุ่ม "ไปออกเกียรติบัตร" ในกล่องผลการบันทึก — คงบริบท /admin หรือ /teacher ตามหน้าที่เข้ามา
          certHref={
            comp.eventId == null
              ? null
              : backHref.startsWith("/admin")
                ? `/admin/cert-issue/${comp.eventId}`
                : `/teacher/certificates/${comp.eventId}`
          }
        />
      </div>
    );
  }

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
