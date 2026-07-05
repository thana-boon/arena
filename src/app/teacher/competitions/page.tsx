import Link from "next/link";
import { requireStaff } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { listCompetitions } from "@/lib/listings";
import { canViewCompetition } from "@/lib/permit";
import { CompetitionsTable } from "@/components/CompetitionsTable";

export const dynamic = "force-dynamic";

export default async function TeacherCompetitions() {
  const session = await requireStaff();
  const year = await getActiveYear();
  const all = year ? await listCompetitions(year.id) : [];
  const comps = all.filter((c) => canViewCompetition(session, c.createdBy, c.groupCatalogNo));

  return (
    <div className="stack">
      <div className="row between">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>รายการแข่งขัน</h1>
          <div className="subtitle">{year ? `ปีการศึกษา ${year.yearBe}` : "ยังไม่เปิดปีการศึกษา"}</div>
        </div>
        <Link href="/teacher/competitions/new" className="btn btn-primary">+ สร้างรายการ</Link>
      </div>

      {!year ? (
        <div className="alert alert-warning">ยังไม่มีปีการศึกษาที่เปิดใช้งาน</div>
      ) : (
        <CompetitionsTable
          comps={comps}
          myCode={session.code}
          role={session.role}
          basePath="/teacher/competitions"
          canPublish={session.role === "recorder" || session.role === "admin"}
        />
      )}
    </div>
  );
}
