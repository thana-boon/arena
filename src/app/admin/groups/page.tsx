import { db } from "@/db";
import { subjectGroups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getActiveYear } from "@/lib/queries";
import { getSubjectGroupCatalog } from "@/lib/subjectGroups";
import { GroupsManager } from "./GroupsManager";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const year = await getActiveYear();
  if (!year) return <div className="alert alert-warning">ยังไม่มีปีการศึกษาที่เปิดใช้งาน</div>;
  const [groups, catalog] = await Promise.all([
    db.select().from(subjectGroups).where(eq(subjectGroups.yearId, year.id)),
    getSubjectGroupCatalog(),
  ]);
  return (
    <div className="stack">
      <div className="page-header">
        <h1>หมวดวิชา</h1>
        <div className="subtitle">ปีการศึกษา {year.yearBe} · เลือกหมวดจากที่ซิงค์มาจาก Teacher API</div>
      </div>
      <GroupsManager
        groups={groups.map((g) => ({ id: g.id, name: g.name, catalogNo: g.catalogNo }))}
        catalog={catalog}
      />
    </div>
  );
}
