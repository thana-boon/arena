import { Icon } from "@/components/Icon";
import { verifyCertificate } from "@/lib/certificates";
import { formatThaiDate, MEDAL_LABEL, type Medal } from "@/lib/domain";

export const dynamic = "force-dynamic";

// หน้าตรวจสอบเกียรติบัตร (public) — สแกน QR จากบนใบแล้วมาที่นี่
// ใบปลอมที่ไม่มีในทะเบียนจะไม่เจอ token → แสดง "ตรวจสอบไม่พบ"
export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cert = await verifyCertificate(token);

  if (!cert) {
    return (
      <div className="stack" style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="empty-state card">
          <Icon name="warning" size={44} className="empty-ico" />
          <h2>ตรวจสอบไม่พบ</h2>
          <p>ไม่พบเกียรติบัตรที่ตรงกับรหัสนี้ในระบบ อาจไม่ใช่เกียรติบัตรที่ออกโดยโรงเรียน</p>
        </div>
      </div>
    );
  }

  const revoked = cert.revokedAt != null;
  const rows: [string, string][] = [
    ["เลขทะเบียน", cert.serialNo],
    ["ชื่อ", cert.nameSnapshot],
    ...(cert.classSnapshot ? ([["ระดับชั้น", cert.classSnapshot]] as [string, string][]) : []),
    ...(cert.teamNameSnapshot ? ([["ทีม", cert.teamNameSnapshot]] as [string, string][]) : []),
    ["รายการแข่งขัน", cert.competitionNameSnapshot],
    ["งาน", cert.eventNameSnapshot],
    ["รางวัล", MEDAL_LABEL[cert.medal as Medal] ?? cert.medal],
    ...(cert.rank ? ([["อันดับ", `อันดับที่ ${cert.rank}`]] as [string, string][]) : []),
    ["ปีการศึกษา", String(cert.yearBeSnapshot)],
    ["วันที่ออก", formatThaiDate(cert.issuedAt)],
  ];

  return (
    <div className="stack" style={{ maxWidth: 560, margin: "0 auto" }}>
      <div className="card stack">
        <div
          className="row"
          style={{ alignItems: "center", gap: 12, color: revoked ? "var(--color-danger, #dc2626)" : "var(--color-success, #16a34a)" }}
        >
          <Icon name={revoked ? "warning" : "chart"} size={28} />
          <h2 style={{ margin: 0 }}>{revoked ? "เกียรติบัตรถูกยกเลิก" : "เกียรติบัตรถูกต้อง"}</h2>
        </div>
        {revoked && cert.revokeReason && (
          <div className="alert alert-error">เหตุผล: {cert.revokeReason}</div>
        )}
        <table className="table">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th style={{ textAlign: "left", width: "35%", whiteSpace: "nowrap" }}>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="subtitle">ข้อมูลนี้บันทึกไว้ในทะเบียนคุมของโรงเรียน ณ วันที่ออกเกียรติบัตร</div>
      </div>
    </div>
  );
}
