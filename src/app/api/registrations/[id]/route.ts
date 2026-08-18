import { db } from "@/db";
import { competitions, entries, entryMembers, events } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { getSession } from "@/lib/auth/session";
import { ApiAuthError } from "@/lib/auth/guards";
import { deleteEntry, RegistrationError } from "@/lib/registration";
import { withdrawGuard } from "@/lib/permit";
import { logAudit } from "@/lib/audit";

// DELETE = ยกเลิกการลงทะเบียน (นักเรียนเจ้าของ / ครู / recorder / admin)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await getSession();
    if (!session) throw new ApiAuthError("กรุณาเข้าสู่ระบบ", 401);
    const id = Number((await params).id);

    const entry = (await db.select().from(entries).where(eq(entries.id, id)).limit(1))[0];
    if (!entry) return fail("ไม่พบการลงทะเบียน", 404);

    // นักเรียนยกเลิกได้เฉพาะของตนเอง
    if (session.role === "student") {
      const members = await db.select().from(entryMembers).where(eq(entryMembers.entryId, id));
      if (!members.some((m) => m.studentCode === session.code))
        return fail("ยกเลิกได้เฉพาะการลงทะเบียนของตนเอง", 403);
    }

    // ปิดรับสมัครแล้ว = ลบรายชื่อไม่ได้ด้วย (ทั้งเจ้าของรายการ ครูประจำชั้น และตัวนักเรียนเอง)
    // เดิมด่านนี้มีแต่ขาเพิ่ม รายชื่อที่ปิดไปแล้วจึงยังถูกลบทิ้งได้หลังหมดเวลา — เหลือแต่ admin ที่ยังลบได้
    const comp = (
      await db.select().from(competitions).where(eq(competitions.id, entry.competitionId)).limit(1)
    )[0];
    const event = comp?.eventId
      ? (await db.select().from(events).where(eq(events.id, comp.eventId)).limit(1))[0] ?? null
      : null;
    const guard = withdrawGuard(session, event);
    if (!guard.allowed) return fail(guard.message, 403);

    try {
      const del = await deleteEntry(id);
      // ลบทิ้งจริง — audit log คือที่เดียวที่เหลือบอกได้ว่าใครถูกถอนออกจากรายการไหน จึงต้องเก็บชื่อไปด้วย
      await logAudit(session.code, "withdraw_entry", {
        entryId: id,
        competitionId: del.competitionId,
        members: del.members,
        keptCertificates: del.keptCertificates,
      });
      return ok();
    } catch (e) {
      if (e instanceof RegistrationError) return fail(e.message, e.status);
      throw e;
    }
  });
}
