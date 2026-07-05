import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/db";
import { subjectGroups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getActiveYear } from "@/lib/queries";
import { canPickGroup } from "@/lib/groupScope";
import { CompetitionForm } from "@/components/CompetitionForm";

export const dynamic = "force-dynamic";

export default async function NewCompetition() {
  const session = await requireStaff();
  const year = await getActiveYear();
  if (!year) return <div className="alert alert-warning">ยังไม่มีปีการศึกษาที่เปิดใช้งาน</div>;
  const allGroups = await db.select().from(subjectGroups).where(eq(subjectGroups.yearId, year.id));
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
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        lockSubjectGroup={!isAdmin}
        initial={{
          name: "",
          subjectGroupId: defaultGroupId,
          type: "individual",
          teamSizeMin: "",
          teamSizeMax: "",
          allowedClassLevels: [],
          eventDate: "",
          startTime: "",
          endTime: "",
          capacityPerLevel: {},
          teamCapacity: 0,
          criteria: [{ name: "", maxScore: "" }],
        }}
      />
    </div>
  );
}
