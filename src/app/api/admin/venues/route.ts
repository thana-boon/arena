import { db } from "@/db";
import { venues } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { getVenues } from "@/lib/queries";
import { venueInput } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

// GET: รายการสถานที่แข่งขันทั้งหมด (master data global)
export async function GET() {
  return handle(async () => {
    await apiRequireRole("admin");
    return ok({ venues: await getVenues() });
  });
}

// POST: สร้างสถานที่ใหม่
export async function POST(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const body = venueInput.parse(await req.json());
    const name = body.name.trim();

    const dup = await db.select({ id: venues.id }).from(venues).where(eq(venues.name, name)).limit(1);
    if (dup.length) return fail("มีสถานที่ชื่อนี้อยู่แล้ว");

    const [res] = await db
      .insert(venues)
      .values({
        name,
        building: body.building?.trim() ?? "",
        note: body.note?.trim() ?? "",
      })
      .returning({ id: venues.id });
    await logAudit(s.code, "create_venue", { id: res.id, name });
    return ok({ id: res.id });
  });
}
