import { Icon } from "@/components/Icon";
import { getActiveYearWithSettings } from "@/lib/queries";
import { listPublishBoard } from "@/lib/publishBoard";
import type { SessionPayload } from "@/lib/auth/session";
import { PublishTable } from "@/components/competition/PublishTable";

/** เนื้อหาหน้าประกาศผล — ใช้ร่วมกันทั้ง /teacher และ /admin */
export async function PublishBody({
  session,
  scoreBasePath,
}: {
  session: SessionPayload;
  scoreBasePath: string;
}) {
  const { year, setting } = await getActiveYearWithSettings();
  const rows = year ? await listPublishBoard(session, year.id) : [];
  const isAdmin = session.role === "admin" || session.role === "recorder";

  return (
    <div className="stack">
      <div className="page-header">
        <h1>ประกาศผลการแข่งขัน</h1>
        <div className="subtitle">
          {isAdmin ? "ทุกรายการในปีนี้" : "รายการในหมวดของท่าน"} · ดูว่ารายการไหนประกาศแล้ว/ยังไม่ประกาศ และกดประกาศหรือยกเลิกได้จากหน้านี้
        </div>
      </div>

      {!year ? (
        <div className="alert alert-warning">ยังไม่เปิดปีการศึกษา</div>
      ) : !rows.length ? (
        <div className="empty-state card">
          <Icon name="chart" size={44} className="empty-ico" />
          <p>ยังไม่มีรายการที่ต้องประกาศผล</p>
          <p className="text-sm">
            {isAdmin
              ? "รายการที่ตั้งไว้ว่า “ไม่มีการแข่งขัน” จะไม่ขึ้นในหน้านี้ เพราะไม่มีผลให้ประกาศ"
              : "หน้านี้แสดงเฉพาะรายการในหมวดของท่าน และไม่รวมรายการที่ตั้งไว้ว่า “ไม่มีการแข่งขัน”"}
          </p>
        </div>
      ) : (
        <PublishTable rows={rows} scoreBasePath={scoreBasePath} defaultEventId={setting?.defaultEventId ?? null} />
      )}

      <p className="form-hint">
        รายการที่ตั้งไว้ว่า “ไม่มีการแข่งขัน” ไม่ถูกนำมาแสดงและไม่นับใน % ความคืบหน้า — รายการแบบนั้นไม่มีคะแนน/อันดับ ออกเกียรติบัตรได้เลยโดยไม่ต้องประกาศผล
      </p>
    </div>
  );
}
