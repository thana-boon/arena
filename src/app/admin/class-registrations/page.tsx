import { requireAdmin } from "@/lib/auth/guards";
import { getActiveYearWithSettings } from "@/lib/queries";
import { db } from "@/db";
import { events } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { ClassRegistrations } from "@/components/ClassRegistrations";
import { RegWindowNotice } from "@/components/RegWindowNotice";

export const dynamic = "force-dynamic";

export default async function AdminClassRegistrations() {
  await requireAdmin();
  const { year, setting } = await getActiveYearWithSettings();
  const eventRows = year
    ? await db
        .select({
          id: events.id,
          name: events.name,
          registrationOpen: events.registrationOpen,
          regStart: events.regStart,
          regEnd: events.regEnd,
        })
        .from(events)
        .where(eq(events.yearId, year.id))
        .orderBy(asc(events.name))
    : [];
  return (
    <div className="stack">
      <div className="page-header">
        <h1>การสมัครรายห้อง</h1>
        <div className="subtitle">เลือกชั้น/ห้อง เพื่อดูการสมัครของนักเรียน และสมัครแทนนักเรียนได้ (ติดกติกา override ได้)</div>
      </div>
      <RegWindowNotice
        events={eventRows}
        note="ผู้ดูแลระบบยังสมัครให้นักเรียนได้ตามปกติ (ระบบบันทึกไว้ใน log)"
      />
      <ClassRegistrations events={eventRows} defaultEventId={setting?.defaultEventId ?? null} isAdmin />
    </div>
  );
}
