import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import { isStaff } from "@/lib/auth/session";
import { getIssuesByIds, loadTemplatesForPrint, verifyBaseUrl, type CertRenderData } from "@/lib/certificates";
import { CertificateCanvas } from "@/components/certificate/CertificateCanvas";
import { formatThaiDate } from "@/lib/domain";
import type { CertAward } from "@/lib/domain";
import QRCode from "qrcode";
import { CertPrintClient } from "./CertPrintClient";

export const dynamic = "force-dynamic";

export default async function CertificatePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const session = await requireAuth();
  if (!isStaff(session.role) && session.role !== "student") redirect("/");

  const idsRaw = (await searchParams).ids ?? "";
  const ids = idsRaw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);

  const all = await getIssuesByIds(ids);
  // นักเรียนพิมพ์ได้เฉพาะใบของตัวเองที่ยังไม่ถูกยกเลิก — id ในลิงก์เดาได้ จึงต้องกรองที่นี่ ไม่ใช่แค่ที่หน้ารายการ
  const issues =
    session.role === "student"
      ? all.filter((i) => i.studentCode === session.code && i.revokedAt == null)
      : all;
  const templates = await loadTemplatesForPrint(issues.map((i) => i.templateId));
  const verifyBase = await verifyBaseUrl();

  // สร้าง QR SVG ล่วงหน้าทุกใบ (เข้ารหัส URL ตรวจสอบ)
  const qrByToken = new Map<string, string>();
  for (const iss of issues) {
    if (!qrByToken.has(iss.verifyToken)) {
      const svg = await QRCode.toString(`${verifyBase}/${iss.verifyToken}`, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
      });
      qrByToken.set(iss.verifyToken, svg);
    }
  }

  if (!issues.length) {
    return <div style={{ padding: 40 }}>ไม่พบเกียรติบัตรที่ต้องการพิมพ์</div>;
  }

  // @page ตั้ง orientation ไม่ได้รายหน้า — ใช้ orientation ของใบแรก (งานหนึ่งแม่แบบเดียว → ทุกใบเหมือนกัน)
  const firstOrientation = templates.get(issues[0].templateId)?.orientation ?? "landscape";

  return (
    <div className="cert-print-root">
      <style>{`@media print { @page { size: A4 ${firstOrientation}; margin: 0; } }`}</style>
      <CertPrintClient />
      <div className="cert-zoom-hint">ย่อให้เห็นเต็มใบแล้ว — ซูมเข้าเพื่ออ่านรายละเอียด</div>
      {issues.map((iss) => {
        const tpl = templates.get(iss.templateId);
        if (!tpl) return null;
        const data: CertRenderData = {
          studentName: iss.nameSnapshot,
          className: iss.classSnapshot,
          teamName: iss.teamNameSnapshot,
          competitionName: iss.competitionNameSnapshot,
          eventName: iss.eventNameSnapshot,
          medal: iss.medal as CertAward,
          rank: iss.rank,
          serialNo: iss.serialNo,
          verifyToken: iss.verifyToken,
          dateText: formatThaiDate(iss.issuedAt),
        };
        const orientation = tpl.orientation;
        return (
          <div key={iss.id} className={`cert-page cert-page-${orientation}`}>
            <CertificateCanvas
              template={tpl}
              data={data}
              pageWidth={orientation === "portrait" ? "210mm" : "297mm"}
              qrSvg={qrByToken.get(iss.verifyToken)}
            />
          </div>
        );
      })}
    </div>
  );
}
