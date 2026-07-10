import { db } from "@/db";
import { competitions, competitionCapacity, criteria, timeSlots } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { competitionInput } from "@/lib/validation";
import { isGroupAllowed } from "@/lib/groupScope";
import { logAudit } from "@/lib/audit";
import { UNLIMITED_CAPACITY } from "@/lib/domain";
import { findVenueConflicts } from "@/lib/venues";

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

    // ช่วงเวลาต้องเป็น slot ของปีปัจจุบัน — เซิร์ฟเวอร์คัดลอกเวลาเริ่ม/สิ้นสุดจาก slot เอง
    const slot = (
      await db.select().from(timeSlots).where(and(eq(timeSlots.id, body.timeSlotId), eq(timeSlots.yearId, year.id))).limit(1)
    )[0];
    if (!slot) return fail("ช่วงเวลาแข่งขันไม่ถูกต้อง กรุณาเลือกใหม่");

    // ตรวจสถานที่ชนกัน (มี venue + วันที่ครบ และยังไม่ยืนยันใช้ห้องเดียวกัน)
    if (body.venueId && body.eventDate && !body.forceVenue) {
      const conflicts = await findVenueConflicts({
        venueId: body.venueId,
        eventDate: body.eventDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
      if (conflicts.length) return ok({ venueConflict: true, conflicts });
    }

    const newId = await db.transaction(async (tx) => {
      const [res] = await tx
        .insert(competitions)
        .values({
          yearId: year.id,
          subjectGroupId: body.subjectGroupId,
          name: body.name.trim(),
          type: body.type,
          capacityMode: body.type === "individual" ? body.capacityMode ?? "per_level" : "per_level",
          teamSizeMin: body.type === "team" ? body.teamSizeMin ?? null : null,
          teamSizeMax: body.type === "team" ? body.teamSizeMax ?? null : null,
          allowedClassLevels: JSON.stringify(body.allowedClassLevels),
          timeSlotId: slot.id,
          venueId: body.venueId ?? null,
          eventDate: body.eventDate || null,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isPublished: false,
          createdBy: s.code,
        })
        .returning({ id: competitions.id });
      const compId = res.id;

      // capacity
      if (body.type === "individual" && body.capacityMode !== "combined") {
        // แยกโควตาตามระดับชั้น → 1 แถวต่อชั้น
        for (const lv of body.allowedClassLevels) {
          await tx.insert(competitionCapacity).values({
            competitionId: compId,
            classLevel: lv,
            capacity: body.capacityPerLevel?.[lv] ?? UNLIMITED_CAPACITY,
            registeredCount: 0,
          });
        }
      } else {
        // ทีม หรือ เดี่ยวแบบรวมทุกชั้น → pool เดียว (class_level = null)
        await tx.insert(competitionCapacity).values({
          competitionId: compId,
          classLevel: null,
          capacity: (body.type === "team" ? body.teamCapacity : body.combinedCapacity) ?? UNLIMITED_CAPACITY,
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
