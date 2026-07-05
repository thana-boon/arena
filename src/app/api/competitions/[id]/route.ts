import { db } from "@/db";
import { competitions, competitionCapacity, criteria, entries, scores } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { competitionInput } from "@/lib/validation";
import { isGroupAllowed } from "@/lib/groupScope";
import { logAudit } from "@/lib/audit";
import { canEditCompetition } from "@/lib/permit";

async function hasEntries(compId: number): Promise<boolean> {
  const rows = await db.select({ id: entries.id }).from(entries).where(eq(entries.competitionId, compId)).limit(1);
  return rows.length > 0;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("teacher", "recorder", "admin");
    const id = Number((await params).id);
    const compRows = await db.select().from(competitions).where(eq(competitions.id, id)).limit(1);
    const comp = compRows[0];
    if (!comp) return fail("ไม่พบรายการแข่งขัน", 404);
    if (!canEditCompetition(s, comp.createdBy)) return fail("ไม่มีสิทธิ์แก้ไขรายการนี้", 403);

    const body = competitionInput.parse(await req.json());

    // ครูย้ายหมวดได้เฉพาะหมวดของตัวเอง (คงหมวดเดิมไว้ได้เสมอ; admin เปลี่ยนได้ทุกหมวด)
    if (body.subjectGroupId !== comp.subjectGroupId && !(await isGroupAllowed(s, comp.yearId, body.subjectGroupId)))
      return fail("เลือกได้เฉพาะหมวดวิชาของท่านเท่านั้น", 403);

    const locked = await hasEntries(id);

    const capRows = await db.select().from(competitionCapacity).where(eq(competitionCapacity.competitionId, id));

    await db.transaction(async (tx) => {
      await tx
        .update(competitions)
        .set({
          name: body.name.trim(),
          subjectGroupId: body.subjectGroupId,
          eventDate: body.eventDate || null,
          startTime: body.startTime || null,
          endTime: body.endTime || null,
          // เปลี่ยนโครงสร้างได้เฉพาะยังไม่มีคนลง
          ...(locked
            ? {}
            : {
                type: body.type,
                teamSizeMin: body.type === "team" ? body.teamSizeMin ?? null : null,
                teamSizeMax: body.type === "team" ? body.teamSizeMax ?? null : null,
                allowedClassLevels: JSON.stringify(body.allowedClassLevels),
              }),
        })
        .where(eq(competitions.id, id));

      if (!locked) {
        // rebuild capacity + criteria
        await tx.delete(competitionCapacity).where(eq(competitionCapacity.competitionId, id));
        if (body.type === "individual") {
          for (const lv of body.allowedClassLevels) {
            await tx.insert(competitionCapacity).values({
              competitionId: id, classLevel: lv, capacity: body.capacityPerLevel?.[lv] ?? 0, registeredCount: 0,
            });
          }
        } else {
          await tx.insert(competitionCapacity).values({
            competitionId: id, classLevel: null, capacity: body.teamCapacity ?? 0, registeredCount: 0,
          });
        }
        await tx.delete(criteria).where(eq(criteria.competitionId, id));
        await tx.insert(criteria).values(
          body.criteria.map((c, i) => ({ competitionId: id, name: c.name.trim(), maxScore: c.maxScore.toFixed(2), sortOrder: i }))
        );
      } else {
        // มีคนลงแล้ว → อัปเดตได้เฉพาะจำนวนรับ (ห้ามต่ำกว่าที่ลงไปแล้ว)
        for (const row of capRows) {
          const newCap =
            comp.type === "individual" && row.classLevel
              ? body.capacityPerLevel?.[row.classLevel]
              : body.teamCapacity;
          if (newCap != null && newCap >= row.registeredCount) {
            await tx.update(competitionCapacity).set({ capacity: newCap }).where(eq(competitionCapacity.id, row.id));
          }
        }
      }
    });

    await logAudit(s.code, "update_competition", { competitionId: id, locked });
    return ok({ locked });
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("teacher", "recorder", "admin");
    const id = Number((await params).id);
    const compRows = await db.select().from(competitions).where(eq(competitions.id, id)).limit(1);
    const comp = compRows[0];
    if (!comp) return fail("ไม่พบรายการแข่งขัน", 404);
    if (!canEditCompetition(s, comp.createdBy)) return fail("ไม่มีสิทธิ์ลบรายการนี้", 403);

    const active = await db.select({ id: entries.id }).from(entries)
      .where(and(eq(entries.competitionId, id), eq(entries.status, "active"))).limit(1);
    if (active.length) return fail("ลบไม่ได้ เพราะมีนักเรียนลงทะเบียนอยู่ (ต้องยกเลิกการลงทะเบียนก่อน)");

    await db.transaction(async (tx) => {
      await tx.delete(scores).where(eq(scores.entryId, id)); // no-op guard
      await tx.delete(criteria).where(eq(criteria.competitionId, id));
      await tx.delete(competitionCapacity).where(eq(competitionCapacity.competitionId, id));
      await tx.delete(competitions).where(eq(competitions.id, id));
    });
    await logAudit(s.code, "delete_competition", { competitionId: id });
    return ok();
  });
}
