import { db } from "@/db";
import { events, certificateTemplates } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { certEventInput } from "@/lib/validation";
import { defaultLayout } from "@/lib/certificates";
import { getActiveYear } from "@/lib/queries";
import { logAudit } from "@/lib/audit";

// GET: รายการงานเกียรติบัตรของปีที่เปิดใช้งาน
export async function GET() {
  return handle(async () => {
    await apiRequireRole("admin");
    const year = await getActiveYear();
    if (!year) return ok({ events: [] });
    const rows = await db
      .select()
      .from(events)
      .where(eq(events.yearId, year.id))
      .orderBy(desc(events.createdAt));
    return ok({ events: rows });
  });
}

// POST: สร้างงานใหม่ + แม่แบบหลักเปล่า ๆ (medalFilter = "") ให้พร้อมแก้ทันที
export async function POST(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const year = await getActiveYear();
    if (!year) return fail("ยังไม่ได้เปิดปีการศึกษา");
    const body = certEventInput.parse(await req.json());

    const [ev] = await db
      .insert(events)
      .values({
        yearId: year.id,
        name: body.name.trim(),
        kind: body.kind ?? "competition",
        eventDate: body.eventDate ?? null,
        status: "draft",
        createdBy: s.code,
      })
      .returning({ id: events.id });

    await db.insert(certificateTemplates).values({
      eventId: ev.id,
      medalFilter: "",
      layout: JSON.stringify(defaultLayout()),
    });

    await logAudit(s.code, "create_cert_event", { id: ev.id, name: body.name });
    return ok({ id: ev.id });
  });
}
