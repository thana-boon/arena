import type { SessionPayload } from "@/lib/auth/session";
import { loadCompetitionSheet } from "@/lib/competitionSheet";
import { ReportsView } from "@/app/teacher/competitions/[id]/reports/ReportsView";

/** เนื้อหาหน้าเอกสาร/รายงาน — ใช้ร่วมกันทั้ง /teacher และ /admin */
export async function ReportsBody({
  id,
  session,
  basePath,
}: {
  id: number;
  session: SessionPayload;
  /** ราก path ของรายการแข่งขันตาม role ที่เข้ามา — ใช้ทำปุ่มย้อนกลับ/ลิงก์หน้าพิมพ์ */
  basePath: string;
}) {
  const res = await loadCompetitionSheet(id, session);
  if (!res.ok) return <div className="alert alert-error">{res.error}</div>;

  return (
    <ReportsView
      backHref={`${basePath}/${id}`}
      printHref={`/competitions/${id}/print`}
      {...res.data}
    />
  );
}
