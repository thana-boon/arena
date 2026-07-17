import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/db";
import { subjectGroups, events } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getActiveYear, getTimeSlots, getVenues } from "@/lib/queries";
import { canPickGroup } from "@/lib/groupScope";
import { CompetitionForm } from "@/components/CompetitionForm";

export const dynamic = "force-dynamic";

export default async function NewCompetition() {
  const session = await requireStaff();
  const year = await getActiveYear();
  if (!year) return <div className="alert alert-warning">ยังไม่มีปีการศึกษาที่เปิดใช้งาน</div>;
  const allGroups = await db.select().from(subjectGroups).where(eq(subjectGroups.yearId, year.id));
  const slots = await getTimeSlots(year.id);
  const venues = await getVenues();
  const eventList = await db.select().from(events).where(eq(events.yearId, year.id)).orderBy(asc(events.name));
  // ครูทั่วไปเลือกได้เฉพาะหมวดตัวเอง; admin เลือกได้ทุกหมวด
  const isAdmin = session.role === "admin";
  const groups = allGroups.filter((g) => canPickGroup(session, g.catalogNo));

  if (!groups.length)
    return <div className="alert alert-warning">ไม่พบหมวดวิชาของท่านในปีการศึกษานี้ กรุณาติดต่อผู้ดูแลระบบให้เพิ่มหมวดของท่าน</div>;

  // มีหมวดเดียว (ครูทั่วไป) → เลือกให้อัตโนมัติ
  const defaultGroupId = groups.length === 1 ? groups[0].id : "";

  return (
    <div className="stack">
      <div className="page-header">
        <h1>สร้างรายการแข่งขัน</h1>
      </div>
      <CompetitionForm
        events={eventList.map((e) => ({ id: e.id, name: e.name, kind: e.kind }))}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        slots={slots.map((s) => ({ id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime }))}
        venues={venues.map((v) => ({ id: v.id, name: v.name, building: v.building }))}
        lockSubjectGroup={!isAdmin}
        initial={{
          name: "",
          description: "",
          eventId: eventList.length === 1 ? eventList[0].id : "",
          subjectGroupId: defaultGroupId,
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
