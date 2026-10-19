import { z } from "zod";
import { db } from "@/db";
import { certificateIssues, competitionCapacity, competitions, entries, entryMembers } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { canScore } from "@/lib/permit";
import { competitionCatalogNos } from "@/lib/competitionGroups";
import { fetchAllTeachers, normalizeTeacherCode, teacherFullName } from "@/lib/external/teacher-api";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  /**
   * รหัสครูที่ติ๊กว่า "เข้าร่วม" — ส่งมาทั้งชุดของกิจกรรมนี้เสมอ (เขียนทับ ไม่ใช่เพิ่มสะสม)
   * ส่งอาเรย์ว่างได้ = ไม่มีครูเข้าร่วมเลย
   */
  teacherCodes: z.array(z.string().trim().min(1).max(64)).max(2000),
});

/**
 * ติ๊กรายชื่อครูที่เข้าร่วมกิจกรรมของครู (competitions.participant_type = 'teacher')
 *
 * ครูไม่ได้สมัครเอง — ผู้จัดเลือกจากรายชื่อครูทั้งโรงเรียน (SchoolOS) แล้วกดบันทึกครั้งเดียว
 * ขั้นนี้จึงเป็นทั้ง "ลงทะเบียน" และ "เช็คชื่อ" ในตัว:
 * - ติ๊กใหม่ → สร้าง entry + member (absent = false = มาร่วม)
 * - ติ๊กเดิมที่ยังติ๊กอยู่ → absent = false
 * - เอาติ๊กออก → ลบทิ้ง ; ยกเว้นคนที่ออกเกียรติบัตรไปแล้ว ให้คงแถวไว้แต่ absent = true
 *   (ใบที่ออกแล้วต้องยังชี้กลับมาหา entry ของมันได้ — การถอนใบเป็นคำสั่งของผู้ดูแลระบบอีกที่หนึ่ง)
 * แล้วประทับ attendance_checked_at เพื่อให้ certIssueGate ปล่อยออกใบได้
 *
 * สิทธิ์เท่ากับการเช็คชื่อ/บันทึกคะแนน: admin/recorder ทุกรายการ ; ครูเฉพาะรายการของตัวเอง/หมวดตัวเอง
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("teacher", "recorder", "admin");
    const compId = Number((await params).id);
    const comp = (await db.select().from(competitions).where(eq(competitions.id, compId)).limit(1))[0];
    if (!comp) return fail("ไม่พบรายการ", 404);
    const groupNos = await competitionCatalogNos(comp.id, comp.subjectGroupId);
    if (!canScore(s, comp.createdBy, groupNos)) return fail("ติ๊กรายชื่อได้เฉพาะรายการในหมวดของท่าน", 403);
    if (comp.participantType !== "teacher") return fail("รายการนี้ผู้เข้าร่วมเป็นนักเรียน — ใช้หน้าลงชื่อ/เช็คชื่อตามปกติ");

    const body = schema.parse(await req.json());
    const wanted = new Set(body.teacherCodes.map(normalizeTeacherCode));

    // รายชื่อที่ติ๊กไว้แล้ว (รวมคนที่เคยเอาติ๊กออกแต่ค้างไว้เพราะออกใบไปแล้ว)
    const entRows = await db
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.competitionId, compId), eq(entries.status, "active")));
    const members = entRows.length
      ? await db.select().from(entryMembers).where(inArray(entryMembers.entryId, entRows.map((e) => e.id)))
      : [];
    const existingCodes = new Set(members.map((m) => normalizeTeacherCode(m.studentCode)));

    // คนที่เพิ่งติ๊กใหม่ต้องเป็นครูที่ยังทำงานอยู่จริง — ชื่อบนเกียรติบัตรมาจาก SchoolOS ไม่ใช่จากเบราว์เซอร์
    const added = [...wanted].filter((c) => !existingCodes.has(c));
    const newMembers: { code: string; name: string }[] = [];
    if (added.length) {
      let teachers;
      try {
        teachers = await fetchAllTeachers();
      } catch {
        return fail("ดึงรายชื่อครูจาก SchoolOS ไม่สำเร็จ กรุณาลองใหม่", 502);
      }
      const byCode = new Map(teachers.map((t) => [normalizeTeacherCode(t.teacher_code), t]));
      for (const code of added) {
        const t = byCode.get(code);
        if (!t) return fail(`ไม่พบครูรหัส ${code} ในรายชื่อครูที่ยังทำงานอยู่`);
        newMembers.push({ code: t.teacher_code, name: teacherFullName(t) });
      }
    }

    const keep = members.filter((m) => wanted.has(normalizeTeacherCode(m.studentCode)));
    const dropped = members.filter((m) => !wanted.has(normalizeTeacherCode(m.studentCode)));
    const droppedEntryIds = [...new Set(dropped.map((m) => m.entryId))];
    const certified = new Set(
      droppedEntryIds.length
        ? (
            await db
              .select({ entryId: certificateIssues.entryId })
              .from(certificateIssues)
              .where(and(eq(certificateIssues.competitionId, compId), inArray(certificateIssues.entryId, droppedEntryIds)))
          ).map((r) => r.entryId)
        : []
    );
    const markAbsent = dropped.filter((m) => certified.has(m.entryId));
    const deleteEntryIds = droppedEntryIds.filter((id) => !certified.has(id));

    await db.transaction(async (tx) => {
      for (const m of newMembers) {
        const [ins] = await tx
          .insert(entries)
          .values({ competitionId: compId, teamName: null, status: "active", createdByRole: s.role, createdByCode: s.code })
          .returning({ id: entries.id });
        await tx.insert(entryMembers).values({ entryId: ins.id, studentCode: m.code, nameSnapshot: m.name, absent: false });
      }
      if (keep.length)
        await tx.update(entryMembers).set({ absent: false }).where(inArray(entryMembers.id, keep.map((m) => m.id)));
      if (markAbsent.length)
        await tx.update(entryMembers).set({ absent: true }).where(inArray(entryMembers.id, markAbsent.map((m) => m.id)));
      if (deleteEntryIds.length) {
        // กิจกรรมของครูไม่มีคะแนน/การเปลี่ยนตัว — ลูกมีแค่ entry_members
        await tx.delete(entryMembers).where(inArray(entryMembers.entryId, deleteEntryIds));
        await tx.delete(entries).where(inArray(entries.id, deleteEntryIds));
      }
      // ยอดในแถวที่นั่ง (pool เดียว ไม่จำกัด) — ให้หน้ารายการโชว์จำนวนผู้เข้าร่วมตรงกับความจริง
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(entries)
        .where(and(eq(entries.competitionId, compId), eq(entries.status, "active")));
      await tx.update(competitionCapacity).set({ registeredCount: n }).where(eq(competitionCapacity.competitionId, compId));
      await tx
        .update(competitions)
        .set({ attendanceCheckedAt: new Date(), attendanceCheckedBy: s.code })
        .where(eq(competitions.id, compId));
    });

    await logAudit(s.code, "record_teacher_participants", {
      competitionId: compId,
      competitionName: comp.name,
      present: wanted.size,
      ...(newMembers.length ? { added: newMembers.map((m) => `${m.name} (${m.code})`) } : {}),
      ...(dropped.length ? { removed: dropped.map((m) => `${m.nameSnapshot} (${m.studentCode})`) } : {}),
    });

    return ok({ present: wanted.size, added: newMembers.length, removed: dropped.length, keptForCertificates: markAbsent.length });
  });
}
