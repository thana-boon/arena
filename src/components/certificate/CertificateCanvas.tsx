import type { CSSProperties } from "react";
import {
  COMBO_TOKENS,
  LINE_H,
  SIG_FONT_DEFAULT,
  SIG_ROLE_RATIO,
  type BlockKind,
  type CertBlock,
  type CertLayout,
  type CertRenderData,
} from "@/lib/certificateLayout";
import { AWARD_LABEL, rankAwardLabel } from "@/lib/domain";

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
  color: string; // ใช้กับชื่อ ตำแหน่ง และเส้นสำหรับเซ็นสด
  fontSize?: number; // % ของความกว้างหน้า (ชื่อ) — ไม่ส่งมา = ค่าเดิม 1.2
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

/** ค่าดิบของแต่ละช่อง (ไม่มี prefix) — ใช้ทั้งบล็อกเดี่ยวและโทเคนในข้อความผสม */
function fieldValue(kind: BlockKind, d: CertRenderData): string {
  switch (kind) {
    case "student_name": return d.studentName;
    case "class": return d.className;
    case "team_name": return d.teamName ?? "";
    case "competition_name": return d.competitionName;
    case "event_name": return d.eventName;
    // "activity" (ไม่มีการแข่งขัน) → "เข้าร่วมกิจกรรม" ; rank = 0 เสมอ บล็อกอันดับจึงว่างเปล่า
    case "medal": return AWARD_LABEL[d.medal] ?? "";
    case "rank": return d.rank ? rankAwardLabel(d.rank) : "";
    case "date": return d.dateText;
    case "serial": return d.serialNo;
    default: return "";
  }
}

const TOKEN_RE = /\{(\w+)\}([ \t]*)/g;

/**
 * ข้อความผสม — แทนที่ {competition_name} ฯลฯ ด้วยค่าจริง
 * ช่องที่ไม่มีค่า (เช่นไม่มีชื่อทีม) ถูกตัดทิ้งพร้อมช่องว่างที่ตามหลัง ไม่งั้นเหลือรูโหว่กลางบรรทัด
 * ช่องว่างที่ผู้ใช้เคาะเองยังอยู่ครบ (บล็อกนี้วาดด้วย white-space: pre) — เว้นวรรคยาว ๆ คั่นคำได้ตามต้องการ
 */
export function comboText(tpl: string, d: CertRenderData): string {
  return tpl
    .replace(TOKEN_RE, (m, key: string, gap: string) => {
      if (!(COMBO_TOKENS as readonly string[]).includes(key)) return m;
      const v = fieldValue(key as BlockKind, d);
      return v ? v + gap : "";
    })
    .trim();
}

function blockText(kind: CertBlock["kind"], d: CertRenderData, prefix?: string): string {
  const p = prefix ?? "";
  switch (kind) {
    case "qr": return "";
    case "static_text": return p;
    case "combo": return comboText(p, d);
    case "serial": return (p || "เลขที่ ") + d.serialNo;
    default: {
      const v = fieldValue(kind, d);
      return v ? p + v : "";
    }
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
          // พื้นขาว + ขอบขาวรอบ QR (quiet zone): เกียรติบัตรพื้นสีเข้มทำให้ QR จมหายและสแกนไม่ติด
          // ถ้าไม่มีกรอบขาวคั่น — QR ที่สร้างมามี margin 0 จึงต้องเว้นขอบให้ตรงนี้
          const boxStyle: CSSProperties = {
            position: "absolute",
            left,
            top: wpc(b.y),
            width: size,
            height: size,
            background: "#fff",
            padding: wpc(b.w * 0.08),
            boxSizing: "border-box",
          };
          // ⚠ ห้ามใส่ children กับ dangerouslySetInnerHTML พร้อมกัน แม้ children จะเป็น false
          //    (React โยน "Can only set one of children or props.dangerouslySetInnerHTML" → หน้าพิมพ์ 500 ทั้งใบ)
          //    จึงต้องแยกเป็นสองสาขา ไม่ใช่เขียนรวมกันแล้วให้ค่าใดค่าหนึ่งเป็น undefined
          return qrSvg ? (
            <div key={b.id} className="cert-qr-box" style={boxStyle} dangerouslySetInnerHTML={{ __html: qrSvg }} />
          ) : (
            <div key={b.id} className="cert-qr-box" style={boxStyle}>
              <div style={{ width: "100%", height: "100%", border: "1px dashed #9ca3af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#9ca3af" }}>
                QR
              </div>
            </div>
          );
        }

        const text = blockText(b.kind, data, b.text);
        if (!text) return null;
        const w = wpc(b.w);
        const left = b.align === "center" ? `calc(${wpc(b.x)} - ${w} / 2)` : b.align === "right" ? `calc(${wpc(b.x)} - ${w})` : wpc(b.x);
        // ข้อความผสมวาดแบบ pre เพื่อให้ช่องว่างที่ผู้ใช้เคาะคั่นระหว่างช่อง (เช่น "รางวัล    รายการ") ไม่ถูกยุบ
        const ws = b.kind === "combo" ? "pre" : "nowrap";
        const common: CSSProperties = {
          position: "absolute",
          top: wpc(b.y),
          fontFamily: FONT_VAR[b.font],
          fontSize: wpc(b.fontSize),
          fontWeight: b.weight,
          color: b.color,
          lineHeight: LINE_H,
          whiteSpace: ws,
        };
        // กรอบพอดีข้อความ: ไม่กำหนดความกว้าง ปล่อยให้ตัวอักษรกำหนดเอง แล้วเลื่อนกล่องด้วย transform
        // ตาม align (ซ้าย = ขอบซ้ายของตัวอักษรอยู่ที่ x พอดี) — ที่เห็นบนจอกับที่พิมพ์ออกมาจึงตรงกัน
        const style: CSSProperties = b.autoFit
          ? {
              ...common,
              left: wpc(b.x),
              width: "max-content",
              transform:
                b.align === "center" ? "translateX(-50%)" : b.align === "right" ? "translateX(-100%)" : undefined,
            }
          : { ...common, left, width: w, textAlign: b.align, overflow: "hidden" };
        // span ครอบข้อความไว้เพื่อให้หน้าออกแบบวัด "ความกว้างจริงของตัวอักษร" ได้ (ตอนพิมพ์ไม่มีผลใด ๆ)
        return (
          <div key={b.id} style={style}>
            <span data-cert-text={b.id}>{text}</span>
          </div>
        );
      })}

      {template.signatures.map((sig) => {
        const w = wpc(sig.width);
        const left = `calc(${wpc(sig.x)} - ${w} / 2)`;
        const sf = sig.fontSize ?? SIG_FONT_DEFAULT;
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
              <div style={{ height: wpc(sig.width * ratio * 0.5), borderBottom: `1px solid ${sig.color}`, margin: `0 ${wpc(sig.width * 0.1)}` }} />
            )}
            {sig.name && (
              <div style={{ fontSize: wpc(sf), lineHeight: LINE_H, marginTop: wpc(0.5), color: sig.color }}>{sig.name}</div>
            )}
            {sig.roleLabel && (
              <div style={{ fontSize: wpc(sf * SIG_ROLE_RATIO), lineHeight: LINE_H, color: sig.color }}>{sig.roleLabel}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
