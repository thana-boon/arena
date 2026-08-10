import Link from "next/link";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/db";
import { events } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getActiveYearWithSettings } from "@/lib/queries";
import { listCompetitions } from "@/lib/listings";
import { canViewCompetition } from "@/lib/permit";
import { competitionEditWindow } from "@/lib/domain";
import { CompetitionsTable } from "@/components/CompetitionsTable";
import { CompEditWindowNotice } from "@/components/RegWindowNotice";

export const dynamic = "force-dynamic";

export default async function TeacherCompetitions() {
  const session = await requireStaff();
  const { year, setting } = await getActiveYearWithSettings();
  const all = year ? await listCompetitions(year.id) : [];
  const comps = all.filter((c) => canViewCompetition(session, c.createdBy, c.groupCatalogNo));

  // ช่วงที่ครูสร้าง/แก้รายการได้ — บอกตั้งแต่เปิดหน้า ไม่ใช่ให้ไปเจอปุ่มหายตอนกดเข้าไป
  const evs = year ? await db.select().from(events).where(eq(events.yearId, year.id)).orderBy(asc(events.name)) : [];
  const canCreate = evs.some((e) => competitionEditWindow(e).open);

  return (
    <div className="stack">
      <div className="page-bar">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>รายการแข่งขัน</h1>
          <div className="subtitle">{year ? `ปีการศึกษา ${year.yearBe}` : "ยังไม่เปิดปีการศึกษา"}</div>
        </div>
        {canCreate && (
          <div className="page-actions">
            <Link href="/teacher/competitions/new" className="btn btn-primary">+ สร้างรายการ</Link>
          </div>
        )}
      </div>

      {year && (
        <CompEditWindowNotice
          events={evs}
          note={
            canCreate
              ? undefined
              : "หลังปิดช่วงนี้ ต้องให้ผู้ดูแลระบบเป็นคนแก้ให้ (กันรายการถูกแก้หลังนักเรียนลงทะเบียนแล้ว)"
          }
        />
      )}

      {!year ? (
        <div className="alert alert-warning">ยังไม่มีปีการศึกษาที่เปิดใช้งาน</div>
      ) : (
        <CompetitionsTable
          comps={comps}
          myCode={session.code}
          mySubjectGroupId={session.subjectGroupId}
          role={session.role}
          basePath="/teacher/competitions"
          defaultEventId={setting?.defaultEventId ?? null}
          // ทุกแถวที่แสดงผ่าน canViewCompetition แล้ว = เป็นรายการในหมวดตัวเอง/ของตัวเอง → ประกาศผลได้
          canPublish
        />
      )}
    </div>
  );
}
