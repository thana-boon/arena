import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { listCompetitions } from "@/lib/listings";
import { CompetitionsTable } from "@/components/CompetitionsTable";

export const dynamic = "force-dynamic";

export default async function AdminCompetitions() {
  const session = await requireAdmin();
  const year = await getActiveYear();
  const comps = year ? await listCompetitions(year.id) : [];

  return (
    <div className="stack">
      <div className="row between">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>รายการแข่งขันทั้งหมด</h1>
          <div className="subtitle">{year ? `ปีการศึกษา ${year.yearBe}` : "ยังไม่เปิดปีการศึกษา"}</div>
        </div>
        <Link href="/admin/competitions/new" className="btn btn-primary">+ สร้างรายการ</Link>
      </div>
      {!year ? (
        <div className="alert alert-warning">ยังไม่มีปีการศึกษาที่เปิดใช้งาน</div>
      ) : (
        <CompetitionsTable comps={comps} myCode={session.code} role="admin" basePath="/admin/competitions" canPublish />
      )}
    </div>
  );
}
