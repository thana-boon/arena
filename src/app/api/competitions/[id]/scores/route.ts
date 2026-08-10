import { z } from "zod";
import { db } from "@/db";
import { competitions, criteria, entries, entryMembers, scores, subjectGroups } from "@/db/schema";
import { eq, and, inArray, notInArray } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { canScore } from "@/lib/permit";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  scores: z.array(
    z.object({
      entryId: z.number().int().positive(),
      criterionId: z.number().int().positive(),
      score: z.number().min(0),
    })
  ),
  /**
   * รายชื่อ (entry_members.id) ที่ติ๊กว่า "ไม่มาแข่งขัน" — ส่งมาทั้งชุดของรายการนี้เสมอ
   * คนที่ไม่ได้อยู่ในชุดจะถูกตั้งกลับเป็น "มาแข่ง" (ติ๊กผิดแล้วเอาออกได้)
   * ไม่ส่งฟิลด์นี้มาเลย = ไม่แตะสถานะการมาแข่งขัน
   */
  absentMemberIds: z.array(z.number().int().positive()).optional(),
});

// บันทึกคะแนน (admin/recorder ทุกรายการ; ครูเฉพาะรายการในหมวดตัวเอง) — upsert ต่อ (entry, criterion)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("teacher", "recorder", "admin");
    const compId = Number((await params).id);
    const comp = (await db.select().from(competitions).where(eq(competitions.id, compId)).limit(1))[0];
    if (!comp) return fail("ไม่พบรายการแข่งขัน", 404);
    const group = comp.subjectGroupId == null ? undefined : (await db.select().from(subjectGroups).where(eq(subjectGroups.id, comp.subjectGroupId)).limit(1))[0];
    if (!canScore(s, comp.createdBy, group?.catalogNo)) return fail("บันทึกคะแนนได้เฉพาะรายการในหมวดของท่าน", 403);
    if (comp.noContest) return fail("รายการนี้ตั้งไว้ว่าไม่มีการแข่งขัน จึงบันทึกคะแนนไม่ได้");

    const body = schema.parse(await req.json());
    const crits = await db.select().from(criteria).where(eq(criteria.competitionId, compId));
    const critMax = new Map(crits.map((c) => [c.id, Number(c.maxScore)]));
    const validEntries = new Set(
      (await db.select({ id: entries.id }).from(entries).where(and(eq(entries.competitionId, compId), eq(entries.status, "active")))).map((e) => e.id)
    );

    // validate ก่อนเขียน
    for (const row of body.scores) {
      const max = critMax.get(row.criterionId);
      if (max == null) return fail("พบเกณฑ์ที่ไม่ถูกต้อง");
      if (!validEntries.has(row.entryId)) return fail("พบผู้เข้าแข่งขันที่ไม่ถูกต้อง");
      if (row.score < 0 || row.score > max) return fail(`คะแนนต้องอยู่ระหว่าง 0–${max}`);
    }

    // สมาชิกทุกคนของรายการนี้ — ใช้ทั้งตรวจว่า id ที่ส่งมาเป็นของรายการนี้จริง
    // และเป็นขอบเขตของการตั้งกลับเป็น "มาแข่ง" (ไม่ไปแตะรายการอื่น)
    const memberRows = validEntries.size
      ? await db
          .select({ id: entryMembers.id, name: entryMembers.nameSnapshot, code: entryMembers.studentCode })
          .from(entryMembers)
          .where(inArray(entryMembers.entryId, [...validEntries]))
      : [];
    const memberIds = memberRows.map((m) => m.id);
    const absentIds = body.absentMemberIds ? [...new Set(body.absentMemberIds)] : null;
    if (absentIds && absentIds.some((id) => !memberIds.includes(id)))
      return fail("พบผู้เข้าแข่งขันที่ไม่ถูกต้อง");

    await db.transaction(async (tx) => {
      for (const row of body.scores) {
        const existing = await tx
          .select({ id: scores.id })
          .from(scores)
          .where(and(eq(scores.entryId, row.entryId), eq(scores.criterionId, row.criterionId)))
          .limit(1);
        if (existing.length) {
          await tx.update(scores).set({ score: row.score.toFixed(2), recordedBy: s.code }).where(eq(scores.id, existing[0].id));
        } else {
          await tx.insert(scores).values({
            entryId: row.entryId,
            criterionId: row.criterionId,
            score: row.score.toFixed(2),
            recordedBy: s.code,
          });
        }
      }

      // สถานะ "ไม่มาแข่งขัน" — เขียนทับทั้งชุด (ติ๊กเพิ่ม/เอาออกจบในครั้งเดียว)
      if (absentIds && memberIds.length) {
        if (absentIds.length)
          await tx.update(entryMembers).set({ absent: true }).where(inArray(entryMembers.id, absentIds));
        await tx
          .update(entryMembers)
          .set({ absent: false })
          .where(
            absentIds.length
              ? and(inArray(entryMembers.id, memberIds), notInArray(entryMembers.id, absentIds))
              : inArray(entryMembers.id, memberIds)
          );
      }
    });

    await logAudit(s.code, "record_scores", {
      competitionId: compId,
      count: body.scores.length,
      // บันทึกไว้ว่าใครไม่มาแข่ง — คนเหล่านี้จะไม่ได้เกียรติบัตร ต้องตามรอยได้ว่าใครเป็นคนติ๊ก
      // เก็บชื่อคู่รหัสเหมือน log ลงทะเบียน (ค้นด้วยชื่อหรือรหัสก็เจอ) ไม่ใช่ id ที่อ่านไม่รู้เรื่อง
      ...(absentIds?.length
        ? {
            absent: memberRows
              .filter((m) => absentIds.includes(m.id))
              .map((m) => `${m.name} (${m.code})`),
          }
        : {}),
    });
    return ok();
  });
}
