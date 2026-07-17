import type { CSSProperties } from "react";
import type { CertBlock, CertLayout, CertRenderData } from "@/lib/certificateLayout";
import { MEDAL_LABEL } from "@/lib/domain";

/**
 * คอมโพเนนต์เดียวใช้ทั้ง preview (บนจอ) และพิมพ์ (PDF) — ต่างกันแค่ค่า pageWidth
 * ทุกพิกัด/ขนาดฟอนต์เป็น % ของหน้ากระดาษ แล้วแปลงเป็นหน่วยจริงด้วย calc(--page-w)
 * → บนจอเห็นอย่างไร PDF ออกมาตรงกันทุก mm ไม่มีอาการชื่อล้นเฉพาะตอนพิมพ์
 *
 * พื้นหลังใช้ <img> ไม่ใช่ background-image: Chrome ไม่พิมพ์ background ถ้าผู้ใช้ไม่ติ๊ก "Background graphics"
 * แต่แท็ก img พิมพ์เสมอ
 */

const FONT_VAR: Record<CertBlock["font"], string> = {
  "th-serif": "var(--font-th-serif)",
  "th-sans": "var(--font-th-sans)",
  "th-modern": "var(--font-th-modern)",
};

export type SignatureView = {
  id: number;
  name: string;
  roleLabel: string;
  mode: "image" | "blank";
  x: number;
  y: number;
  width: number;
  imageSrc: string | null; // data URI หรือ url
};

export type CanvasTemplate = {
  orientation: "landscape" | "portrait";
  backgroundSrc: string | null; // data URI หรือ url
  layout: CertLayout;
  signatures: SignatureView[];
};

// A4 อัตราส่วน 297:210
const RATIO = 210 / 297;

function blockText(kind: CertBlock["kind"], d: CertRenderData, prefix?: string): string {
  const p = prefix ?? "";
  switch (kind) {
    case "student_name": return p + d.studentName;
    case "class": return d.className ? p + d.className : "";
    case "team_name": return d.teamName ? p + d.teamName : "";
    case "competition_name": return p + d.competitionName;
    case "event_name": return p + d.eventName;
    case "medal": return d.medal === "none" ? p + MEDAL_LABEL.none : p + MEDAL_LABEL[d.medal];
    case "rank": return d.rank ? `${p}อันดับที่ ${d.rank}` : "";
    case "date": return p + d.dateText;
    case "serial": return (p || "เลขที่ ") + d.serialNo;
    case "static_text": return p;
    default: return "";
  }
}

export function CertificateCanvas({
  template,
  data,
  pageWidth,
  qrSvg,
  className,
}: {
  template: CanvasTemplate;
  data: CertRenderData;
  pageWidth: string; // เช่น "900px" (จอ) หรือ "297mm" (พิมพ์)
  qrSvg?: string | null; // SVG string ของ QR (print ส่งมาจาก server); ไม่มี = กล่อง placeholder
  className?: string;
}) {
  const isPortrait = template.orientation === "portrait";
  const ratio = isPortrait ? 297 / 210 : RATIO;

  const rootStyle: CSSProperties & Record<string, string> = {
    ["--page-w"]: pageWidth,
    width: "var(--page-w)",
    height: `calc(var(--page-w) * ${ratio})`,
    position: "relative",
    overflow: "hidden",
    background: "#fff",
  };

  // ขนาดที่อิงความกว้างหน้า (% → หน่วยจริง)
  const wpc = (v: number) => `calc(var(--page-w) * ${v / 100})`;

  return (
    <div style={rootStyle} className={className}>
      {template.backgroundSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={template.backgroundSrc}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill" }}
        />
      )}

      {template.layout.map((b) => {
        if (b.kind === "qr") {
          const size = wpc(b.w);
          const left = b.align === "right" ? `calc(${wpc(b.x)} - ${size})` : b.align === "center" ? `calc(${wpc(b.x)} - ${size} / 2)` : wpc(b.x);
          return (
            <div
              key={b.id}
              style={{ position: "absolute", left, top: wpc(b.y), width: size, height: size }}
              dangerouslySetInnerHTML={qrSvg ? { __html: qrSvg } : undefined}
            >
              {!qrSvg && (
                <div style={{ width: "100%", height: "100%", border: "1px dashed #9ca3af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#9ca3af" }}>
                  QR
                </div>
              )}
            </div>
          );
        }

        const text = blockText(b.kind, data, b.text);
        if (!text) return null;
        const w = wpc(b.w);
        const left = b.align === "center" ? `calc(${wpc(b.x)} - ${w} / 2)` : b.align === "right" ? `calc(${wpc(b.x)} - ${w})` : wpc(b.x);
        return (
          <div
            key={b.id}
            style={{
              position: "absolute",
              left,
              top: wpc(b.y),
              width: w,
              textAlign: b.align,
              fontFamily: FONT_VAR[b.font],
              fontSize: wpc(b.fontSize),
              fontWeight: b.weight,
              color: b.color,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {text}
          </div>
        );
      })}

      {template.signatures.map((sig) => {
        const w = wpc(sig.width);
        const left = `calc(${wpc(sig.x)} - ${w} / 2)`;
        return (
          <div
            key={sig.id}
            style={{
              position: "absolute",
              left,
              top: wpc(sig.y),
              width: w,
              textAlign: "center",
              fontFamily: FONT_VAR["th-serif"],
            }}
          >
            {sig.mode === "image" && sig.imageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sig.imageSrc} alt="" style={{ height: wpc(sig.width * ratio * 0.5), maxWidth: "100%", objectFit: "contain", margin: "0 auto", display: "block" }} />
            ) : (
              <div style={{ height: wpc(sig.width * ratio * 0.5), borderBottom: "1px solid #374151", margin: `0 ${wpc(sig.width * 0.1)}` }} />
            )}
            {sig.name && <div style={{ fontSize: wpc(1.2), marginTop: wpc(0.5), color: "#1f2937" }}>{sig.name}</div>}
            {sig.roleLabel && <div style={{ fontSize: wpc(1), color: "#4b5563" }}>{sig.roleLabel}</div>}
          </div>
        );
      })}
    </div>
  );
}
