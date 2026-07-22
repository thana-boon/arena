import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db";
import { subjectGroups, events } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getActiveYearWithSettings, getTimeSlots, getVenues } from "@/lib/queries";
import { CompetitionForm } from "@/components/CompetitionForm";

export const dynamic = "force-dynamic";

export default async function AdminNewCompetition() {
  await requireAdmin();
  const { year, setting } = await getActiveYearWithSettings();
  if (!year) return <div className="alert alert-warning">ยังไม่มีปีการศึกษาที่เปิดใช้งาน</div>;
  const groups = await db.select().from(subjectGroups).where(eq(subjectGroups.yearId, year.id));
  const slots = await getTimeSlots(year.id);
  const venues = await getVenues();
  const eventList = await db.select().from(events).where(eq(events.yearId, year.id)).orderBy(asc(events.name));

  return (
    <div className="stack">
      <div className="page-header">
        <h1>สร้างรายการแข่งขัน</h1>
        <div className="subtitle">ปีการศึกษา {year.yearBe} · กรอกข้อมูล 4 ส่วนแล้วกด “สร้างรายการ”</div>
      </div>
      <CompetitionForm
        events={eventList.map((e) => ({ id: e.id, name: e.name, kind: e.kind }))}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        slots={slots.map((s) => ({ id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime }))}
        venues={venues.map((v) => ({ id: v.id, name: v.name, building: v.building }))}
        returnTo="/admin/competitions"
        initial={{
          name: "",
          description: "",
          eventId:
            (setting?.defaultEventId && eventList.some((e) => e.id === setting.defaultEventId)
              ? setting.defaultEventId
              : eventList.length === 1
                ? eventList[0].id
                : "") as number | "",
          subjectGroupId: "",
          type: "individual",
          visibleToStudents: true,
          teamSizeMin: "",
          teamSizeMax: "",
          allowedClassLevels: [],
          timeSlotId: "",
          venueId: "",
          eventDate: "",
          capacityMode: "per_level",
          unlimited: true,
          capacityPerLevel: {},
          combinedCapacity: 0,
          teamCapacity: 0,
          criteria: [{ name: "", maxScore: "" }],
        }}
      />
    </div>
  );
}
