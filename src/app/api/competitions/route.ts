import { db } from "@/db";
import { competitions, competitionCapacity, criteria } from "@/db/schema";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { competitionInput } from "@/lib/validation";
import { isGroupAllowed } from "@/lib/groupScope";
import { logAudit } from "@/lib/audit";

// POST: สร้างรายการแข่งขัน (teacher/recorder/admin) — default ไม่เผยแพร่
export async function POST(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("teacher", "recorder", "admin");
    const body = competitionInput.parse(await req.json());
    const year = await getActiveYear();
    if (!year) return fail("ยังไม่มีปีการศึกษาที่เปิดใช้งาน");

    // ครูสร้างได้เฉพาะหมวดของตัวเอง (admin เลือกได้ทุกหมวด)
    if (!(await isGroupAllowed(s, year.id, body.subjectGroupId)))
      return fail("เลือกได้เฉพาะหมวดวิชาของท่านเท่านั้น", 403);

    const newId = await db.transaction(async (tx) => {
      const [res] = await tx.insert(competitions).values({
        yearId: year.id,
        subjectGroupId: body.subjectGroupId,
        name: body.name.trim(),
        type: body.type,
        capacityMode: body.type === "individual" ? body.capacityMode ?? "per_level" : "per_level",
        teamSizeMin: body.type === "team" ? body.teamSizeMin ?? null : null,
        teamSizeMax: body.type === "team" ? body.teamSizeMax ?? null : null,
        allowedClassLevels: JSON.stringify(body.allowedClassLevels),
        eventDate: body.eventDate || null,
        startTime: body.startTime || null,
        endTime: body.endTime || null,
        isPublished: false,
        createdBy: s.code,
      });
      const compId = res.insertId;

      // capacity
      if (body.type === "individual" && body.capacityMode !== "combined") {
        // แยกโควตาตามระดับชั้น → 1 แถวต่อชั้น
        for (const lv of body.allowedClassLevels) {
          await tx.insert(competitionCapacity).values({
            competitionId: compId,
            classLevel: lv,
            capacity: body.capacityPerLevel?.[lv] ?? 0,
            registeredCount: 0,
          });
        }
      } else {
        // ทีม หรือ เดี่ยวแบบรวมทุกชั้น → pool เดียว (class_level = null)
        await tx.insert(competitionCapacity).values({
          competitionId: compId,
          classLevel: null,
          capacity: (body.type === "team" ? body.teamCapacity : body.combinedCapacity) ?? 0,
          registeredCount: 0,
        });
      }

      // criteria
      await tx.insert(criteria).values(
        body.criteria.map((c, i) => ({
          competitionId: compId,
          name: c.name.trim(),
          maxScore: c.maxScore.toFixed(2),
          sortOrder: i,
        }))
      );
      return compId;
    });

    await logAudit(s.code, "create_competition", { competitionId: newId, name: body.name });
    return ok({ id: newId });
  });
}
