import { requireStaff } from "@/lib/auth/guards";
import { getIssuesByIds, loadTemplatesForPrint, type CertRenderData } from "@/lib/certificates";
import { CertificateCanvas } from "@/components/certificate/CertificateCanvas";
import { formatThaiDate } from "@/lib/domain";
import type { Medal } from "@/lib/domain";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { PrintTrigger } from "./PrintTrigger";

export const dynamic = "force-dynamic";

/** URL ฐานสำหรับ QR (ต้องเป็น absolute เพื่อสแกนจากมือถือได้) — สร้างจาก host จริง + basePath */
async function verifyBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${proto}://${host}${base}/verify`;
}

export default async function CertificatePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  await requireStaff();
  const idsRaw = (await searchParams).ids ?? "";
  const ids = idsRaw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);

  const issues = await getIssuesByIds(ids);
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
      <PrintTrigger />
      {issues.map((iss) => {
        const tpl = templates.get(iss.templateId);
        if (!tpl) return null;
        const data: CertRenderData = {
          studentName: iss.nameSnapshot,
          className: iss.classSnapshot,
          teamName: iss.teamNameSnapshot,
          competitionName: iss.competitionNameSnapshot,
          eventName: iss.eventNameSnapshot,
          medal: iss.medal as Medal,
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
