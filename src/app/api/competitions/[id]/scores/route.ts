import { z } from "zod";
import { db } from "@/db";
import { competitions, criteria, entries, scores, subjectGroups } from "@/db/schema";
import { eq, and } from "drizzle-orm";
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
    });

    await logAudit(s.code, "record_scores", { competitionId: compId, count: body.scores.length });
    return ok();
  });
}
