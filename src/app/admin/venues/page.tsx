import { db } from "@/db";
import { events } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getActiveYearWithSettings, getVenues } from "@/lib/queries";
import { getCompetitionSchedule } from "@/lib/venues";
import { VenuesWorkspace } from "./VenuesWorkspace";

export const dynamic = "force-dynamic";

export default async function VenuesPage() {
  const [venueRows, { year, setting }] = await Promise.all([getVenues(), getActiveYearWithSettings()]);
  const eventRows = year
    ? await db.select().from(events).where(eq(events.yearId, year.id)).orderBy(asc(events.name))
    : [];
  const schedule = year ? await getCompetitionSchedule(year.id) : [];

  return (
    <div className="stack">
      <div className="page-header">
        <h1>สถานที่แข่งขัน</h1>
        <div className="subtitle">
          ดูว่าห้องไหนถูกใช้ไปแล้ว/ยังว่างในแต่ละงาน · รายชื่อห้องเป็นข้อมูลกลาง (master data) ใช้ร่วมทุกปีการศึกษา
        </div>
      </div>
      <VenuesWorkspace
        venues={venueRows.map((v) => ({ id: v.id, name: v.name, building: v.building, note: v.note }))}
        events={eventRows.map((e) => ({ id: e.id, name: e.name }))}
        competitions={schedule}
        defaultEventId={setting?.defaultEventId ?? null}
      />
    </div>
  );
}
