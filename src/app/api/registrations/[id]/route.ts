import { db } from "@/db";
import { entries, entryMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { getSession } from "@/lib/auth/session";
import { ApiAuthError } from "@/lib/auth/guards";
import { withdrawEntry, RegistrationError } from "@/lib/registration";
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

    try {
      await withdrawEntry(id);
      await logAudit(session.code, "withdraw_entry", { entryId: id, competitionId: entry.competitionId });
      return ok();
    } catch (e) {
      if (e instanceof RegistrationError) return fail(e.message, e.status);
      throw e;
    }
  });
}
