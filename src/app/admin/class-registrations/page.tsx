import { requireAdmin } from "@/lib/auth/guards";
import { getActiveYearWithSettings } from "@/lib/queries";
import { db } from "@/db";
import { events } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { ClassRegistrations } from "@/components/ClassRegistrations";

export const dynamic = "force-dynamic";

export default async function AdminClassRegistrations() {
  await requireAdmin();
  const { year, setting } = await getActiveYearWithSettings();
  const eventRows = year
    ? await db.select({ id: events.id, name: events.name }).from(events).where(eq(events.yearId, year.id)).orderBy(asc(events.name))
    : [];
  return (
    <div className="stack">
      <div className="page-header">
        <h1>การสมัครรายห้อง</h1>
        <div className="subtitle">เลือกชั้น/ห้อง เพื่อดูว่านักเรียนแต่ละคนสมัครกิจกรรมอะไรไปแล้วบ้าง</div>
      </div>
      <ClassRegistrations events={eventRows} defaultEventId={setting?.defaultEventId ?? null} />
    </div>
  );
}
