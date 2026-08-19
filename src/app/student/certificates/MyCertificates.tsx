"use client";
import { Icon } from "@/components/Icon";
import { AWARD_LABEL, MEDAL_BADGE_CLASS, formatThaiDate, rankAwardLabel, type CertAward } from "@/lib/domain";

// window.open ไม่ถูกเติม basePath (/arena) ให้อัตโนมัติเหมือน <Link> — ต้อง prefix เอง
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Row = {
  id: number;
  serialNo: string;
  yearBe: number;
  eventName: string;
  competitionName: string;
  teamName: string | null;
  className: string;
  award: CertAward;
  rank: number;
  issuedAt: string;
  revoked: boolean;
};

/** เปิดใบในแท็บใหม่ — ดู/แคปหน้าจอได้เลย ถ้าจะพิมพ์หรือบันทึก PDF กดปุ่มบนแถบในแท็บนั้น */
const openPrint = (ids: number[]) => {
  if (ids.length) window.open(`${BASE}/certificates/print?ids=${ids.join(",")}`, "_blank");
};

const awardClass = (award: CertAward) =>
  award === "activity" ? "badge" : MEDAL_BADGE_CLASS[award] ?? "badge";

export function MyCertificates({ rows }: { rows: Row[] }) {
  if (!rows.length) {
    return (
      <div className="empty-state card">
        <Icon name="trophy" size={44} className="empty-ico" />
        <p>ยังไม่มีเกียรติบัตร</p>
        <div className="subtitle">
          เมื่อครูออกเกียรติบัตรของรายการที่ร่วมแข่งขัน/เข้าร่วม ใบของท่านจะมาอยู่ที่นี่
        </div>
      </div>
    );
  }

  const printable = rows.filter((r) => !r.revoked).map((r) => r.id);
  // ปีใหม่สุดอยู่บน (ข้อมูลเรียงมาจากฝั่ง server แล้ว) — แยกหัวข้อรายปีให้หาใบเก่าง่าย
  const years = [...new Set(rows.map((r) => r.yearBe))];

  return (
    <div className="stack">
      {printable.length > 1 && (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-secondary btn-sm" onClick={() => openPrint(printable)}>
            <Icon name="file" size={16} /> เปิดดูทุกใบ ({printable.length})
          </button>
        </div>
      )}

      {years.map((yearBe) => (
        <div key={yearBe} className="stack">
          <h2 className="mb-0">ปีการศึกษา {yearBe}</h2>
          {rows
            .filter((r) => r.yearBe === yearBe)
            .map((r) => (
              <div key={r.id} className="card">
                <div className="row between" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <span className={awardClass(r.award)}>{AWARD_LABEL[r.award]}</span>
                      {r.rank > 0 && <span className="badge">{rankAwardLabel(r.rank)}</span>}
                      {r.revoked && <span className="badge badge-warning">ยกเลิกแล้ว</span>}
                    </div>
                    <h3 style={{ margin: "8px 0 4px" }}>{r.competitionName}</h3>
                    <div className="text-sm muted">
                      {r.eventName}
                      {r.teamName && ` · ทีม ${r.teamName}`}
                      {r.className && ` · ${r.className}`}
                    </div>
                    <div className="text-sm muted">
                      เลขทะเบียน {r.serialNo} · ออกเมื่อ {formatThaiDate(r.issuedAt)}
                    </div>
                  </div>
                  {r.revoked ? (
                    <span className="badge">พิมพ์ไม่ได้</span>
                  ) : (
                    <button className="btn btn-sm btn-primary" onClick={() => openPrint([r.id])}>
                      <Icon name="file" size={16} /> เปิดดูเกียรติบัตร
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
