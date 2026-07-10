import { db } from "@/db";
import { venues, competitions } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { venueInput } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

// PATCH: แก้ไขสถานที่
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const id = Number((await params).id);
    const body = venueInput.parse(await req.json());
    const name = body.name.trim();

    const cur = await db.select({ id: venues.id }).from(venues).where(eq(venues.id, id)).limit(1);
    if (!cur.length) return fail("ไม่พบสถานที่", 404);

    // กันชื่อซ้ำกับสถานที่อื่น
    const dup = await db
      .select({ id: venues.id })
      .from(venues)
      .where(and(eq(venues.name, name), ne(venues.id, id)))
      .limit(1);
    if (dup.length) return fail("มีสถานที่ชื่อนี้อยู่แล้ว");

    await db
      .update(venues)
      .set({ name, building: body.building?.trim() ?? "", note: body.note?.trim() ?? "" })
      .where(eq(venues.id, id));
    await logAudit(s.code, "update_venue", { id, name });
    return ok();
  });
}

// DELETE: ลบสถานที่ (กันลบถ้ามีรายการแข่งขันอ้างอยู่)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const id = Number((await params).id);

    const used = await db
      .select({ id: competitions.id })
      .from(competitions)
      .where(eq(competitions.venueId, id))
      .limit(1);
    if (used.length) return fail("ลบไม่ได้ เพราะมีรายการแข่งขันใช้สถานที่นี้อยู่");

    await db.delete(venues).where(eq(venues.id, id));
    await logAudit(s.code, "delete_venue", { id });
    return ok();
  });
}
