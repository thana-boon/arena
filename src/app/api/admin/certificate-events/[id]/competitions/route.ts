import { db } from "@/db";
import { certificateEventCompetitions, certificateEvents, competitions } from "@/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { certEventCompetitionsInput } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

// PUT: ตั้งชุดรายการแข่งขันของงาน (แทนที่ทั้งชุด)
// กันแย่งรายการที่งานอื่นถือไว้อยู่แล้ว — unique(competition_id) จะ throw แต่เราเช็คก่อนเพื่อคืน error ที่อ่านรู้เรื่อง
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const eventId = Number((await params).id);
    const ev = await db.select().from(certificateEvents).where(eq(certificateEvents.id, eventId)).limit(1);
    if (!ev.length) return fail("ไม่พบงาน", 404);

    const { competitionIds } = certEventCompetitionsInput.parse(await req.json());
    const ids = [...new Set(competitionIds)];

    if (ids.length) {
      // ต้องเป็นรายการในปีเดียวกับงาน
      const valid = await db
        .select({ id: competitions.id })
        .from(competitions)
        .where(and(eq(competitions.yearId, ev[0].yearId), inArray(competitions.id, ids)));
      if (valid.length !== ids.length) return fail("มีรายการแข่งขันที่ไม่ถูกต้อง");

      // ถูกงานอื่นถือไว้แล้วหรือไม่
      const taken = await db
        .select({ competitionId: certificateEventCompetitions.competitionId })
        .from(certificateEventCompetitions)
        .where(
          and(
            inArray(certificateEventCompetitions.competitionId, ids),
            ne(certificateEventCompetitions.eventId, eventId)
          )
        );
      if (taken.length) return fail("มีรายการที่ถูกจัดเข้างานอื่นแล้ว กรุณารีเฟรชหน้าจอ");
    }

    // แทนที่ทั้งชุด
    await db.delete(certificateEventCompetitions).where(eq(certificateEventCompetitions.eventId, eventId));
    if (ids.length) {
      await db
        .insert(certificateEventCompetitions)
        .values(ids.map((competitionId) => ({ eventId, competitionId })));
    }
    await logAudit(s.code, "set_cert_event_competitions", { eventId, count: ids.length });
    return ok();
  });
}
