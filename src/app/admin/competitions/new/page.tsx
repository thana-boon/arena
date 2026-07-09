import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db";
import { subjectGroups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getActiveYear, getTimeSlots } from "@/lib/queries";
import { CompetitionForm } from "@/components/CompetitionForm";

export const dynamic = "force-dynamic";

export default async function AdminNewCompetition() {
  await requireAdmin();
  const year = await getActiveYear();
  if (!year) return <div className="alert alert-warning">ยังไม่มีปีการศึกษาที่เปิดใช้งาน</div>;
  const groups = await db.select().from(subjectGroups).where(eq(subjectGroups.yearId, year.id));
  const slots = await getTimeSlots(year.id);

  return (
    <div className="stack">
      <div className="page-header">
        <h1>สร้างรายการแข่งขัน</h1>
      </div>
      <CompetitionForm
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        slots={slots.map((s) => ({ id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime }))}
        returnTo="/admin/competitions"
        initial={{
          name: "",
          subjectGroupId: "",
          type: "individual",
          teamSizeMin: "",
          teamSizeMax: "",
          allowedClassLevels: [],
          timeSlotId: "",
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
