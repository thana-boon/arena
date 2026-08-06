"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useAlert, useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { CertificateCanvas, type CanvasTemplate } from "@/components/certificate/CertificateCanvas";
import { compressImage, presetFor, SIG_TUNE_NEW, SIG_TUNE_SAVED, type CompressResult, type SigTune } from "@/lib/imageCompress";
import { SignatureTuner } from "@/components/certificate/SignatureTuner";
import { fitCertTexts } from "@/lib/certFit";
import {
  BLOCK_KINDS,
  BLOCK_LABEL,
  blockRect,
  blockShrinks,
  COMBO_TOKENS,
  LINE_H,
  pageMaxY,
  pageRatio,
  clampSigScale,
  SIG_FONT_DEFAULT,
  SIG_IMAGE_SCALE_DEFAULT,
  SIG_IMAGE_SCALE_MAX,
  SIG_IMAGE_SCALE_MIN,
  sigRect,
  type BlockKind,
  type CertBlock,
  type CertLayout,
  type CertRenderData,
  type Orientation,
  type Rect,
} from "@/lib/certificateLayout";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const assetUrl = (id: number | null) => (id == null ? null : `${BASE}/api/admin/certificate-assets/${id}`);

/** ระยะที่ถือว่า "เข้าใกล้เส้นกึ่งกลาง" แล้วให้ดูดเข้าหา (หน่วย % ของความกว้างหน้า) */
const SNAP = 0.8;
/** ความกว้างต่ำสุดที่ยังลากจับได้ */
const MIN_W = 2;
/** ระยะขอบมาตรฐานของปุ่มชิดซ้าย/ขวา/บน/ล่าง */
const MARGIN = 8;
/** ขนาดตัวอักษรที่ลากมุมได้ (% ของความกว้างหน้า) — ล่างสุดยังพออ่านออก บนสุดคือเต็มหน้ากระดาษพอดี */
const MIN_FONT = 0.5;
const MAX_FONT = 20;

type SigEdit = {
  name: string;
  roleLabel: string;
  mode: "image" | "blank";
  assetId: number | null;
  x: number;
  y: number;
  width: number;
  color: string;
  fontSize: number; // ขนาดชื่อ (% ของความกว้างหน้า) — ตำแหน่งย่อตามอัตโนมัติ
  imageScale: number; // ตัวคูณขนาดเฉพาะรูปลายเซ็น (1 = เท่ากรอบเดิม)
};

/** กรอบของข้อความจริงบนกระดาษ ที่วัดจาก DOM (คีย์ = id ของบล็อก) */
type TextRects = Record<string, Rect>;

const RECT_EPS = 0.02; // % ของความกว้างหน้า — ต่ำกว่านี้ถือว่ากรอบเท่าเดิม ไม่ต้อง setState ซ้ำ
function sameRects(a: TextRects, b: TextRects): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => {
    const x = a[k], y = b[k];
    return (
      y != null &&
      Math.abs(x.left - y.left) < RECT_EPS &&
      Math.abs(x.top - y.top) < RECT_EPS &&
      Math.abs(x.w - y.w) < RECT_EPS &&
      Math.abs(x.h - y.h) < RECT_EPS
    );
  });
}

type CompRow = { id: number; name: string; type: string; isPublished: boolean };

/** สิ่งที่กำลังเลือกอยู่ — บล็อกข้อความ หรือผู้ลงนามลำดับที่ i */
type Target = { kind: "block"; id: string } | { kind: "sig"; i: number };

type DragMode = "move" | "resize-l" | "resize-r" | "scale";

/** บล็อกนี้ใช้กรอบพอดีข้อความอยู่หรือไม่ — QR ไม่นับ (ไม่ใช่ตัวอักษร ความกว้างคือขนาดรูปจริง) */
const isFit = (b: CertBlock) => b.kind !== "qr" && b.autoFit === true;

/**
 * กรอบสำหรับลาก/จัดตำแหน่งของบล็อก
 * กรอบพอดีข้อความเอา "ซ้าย/กว้าง" จากตัวอักษรจริงที่วัดได้ แต่ "บน/สูง" ยังยึดบรรทัดตามที่ canvas วาง
 * — ที่วัดได้เป็นกรอบของตัวอักษรล้วน ซึ่งลอยสูงกว่าขอบบนของบรรทัดอยู่นิดหนึ่งตามฟอนต์
 *   ถ้าเอาค่านั้นไปเขียนกลับเป็น y ทุกครั้งที่เริ่มลาก บล็อกจะขยับขึ้นทีละนิดสะสมไปเรื่อย ๆ
 */
function fitRect(b: CertBlock, orientation: Orientation, measured?: Rect): Rect {
  const r = blockRect(b, orientation);
  return measured && isFit(b) ? { left: measured.left, top: r.top, w: measured.w, h: r.h } : r;
}

/**
 * รูปพื้นหลังถูกวางแบบ cover — เต็มหน้าเสมอ ไม่ยืดบิดเบี้ยว แต่ส่วนที่เกินสัดส่วนกระดาษจะโดนครอบตัด
 * คืนว่าตัดด้านไหน ข้างละกี่ % ของรูป เพื่อเตือนครูก่อนที่ลายกรอบสวย ๆ จะหายไปเงียบ ๆ
 */
function bgCrop(size: { w: number; h: number } | null, orientation: Orientation): { side: "บน-ล่าง" | "ซ้าย-ขวา"; pct: number } | null {
  if (!size || size.w <= 0 || size.h <= 0) return null;
  const page = pageRatio(orientation); // สูง/กว้าง
  const img = size.h / size.w;
  // รูป "สูง" กว่ากระดาษ → พอขยายให้เต็มความกว้าง ส่วนเกินอยู่บน-ล่าง
  const [side, lost] = img > page ? (["บน-ล่าง", 1 - page / img] as const) : (["ซ้าย-ขวา", 1 - img / page] as const);
  const pct = Math.round((lost / 2) * 100);
  return pct < 1 ? null : { side, pct };
}

const sameTarget = (a: Target | null, b: Target) =>
  a != null && (a.kind === "block" && b.kind === "block" ? a.id === b.id : a.kind === "sig" && b.kind === "sig" ? a.i === b.i : false);

export function CertEditor(props: {
  event: { id: number; name: string; eventDate: string | null; status: string };
  yearBe: number;
  initialLayout: CertLayout;
  initialOrientation: Orientation;
  initialBackgroundId: number | null;
  initialSignatures: SigEdit[];
  competitions: CompRow[];
  sample: CertRenderData;
  sampleQrSvg: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const alert = useAlert();
  const toast = useToast();
  const eventId = props.event.id;
  const locked = props.event.status === "locked";

  const [status, setStatus] = useState(props.event.status);
  const [orientation, setOrientation] = useState<Orientation>(props.initialOrientation);
  const [backgroundId, setBackgroundId] = useState<number | null>(props.initialBackgroundId);
  const [layout, setLayout] = useState<CertLayout>(props.initialLayout);
  const [signatures, setSignatures] = useState<SigEdit[]>(props.initialSignatures);
  const [sel, setSel] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);
  /** ขนาดจริงของรูปพื้นหลัง — ใช้บอกว่าจะโดนครอบตัดกี่ % เท่านั้น ไม่ได้มีผลกับการวาด */
  const [bgSize, setBgSize] = useState<{ w: number; h: number } | null>(null);
  /** รูปลายเซ็นที่กำลังปรับอยู่ในกล่อง SignatureTuner (null = ไม่ได้เปิด) */
  const [sigTune, setSigTune] = useState<{ i: number; src: File | string; initial: SigTune; name: string } | null>(null);

  /**
   * ความกว้างจริงของตัวอักษรแต่ละบล็อก วัดจากกระดาษที่กำลังแสดงอยู่
   * ใช้สองอย่าง: (1) บล็อกที่ตั้ง "กรอบพอดีข้อความ" ใช้ค่านี้เป็นกรอบลากจริง ๆ
   * (2) บล็อกกรอบคงที่เอาไปวาดเส้นบาง ๆ ให้เห็นว่าตัวหนังสือกินที่จริงแค่ไหนในกรอบ
   */
  const [textRects, setTextRects] = useState<TextRects>({});
  const onMeasure = useCallback((m: TextRects) => {
    setTextRects((prev) => (sameRects(prev, m) ? prev : m));
  }, []);

  // เต็มจอ = โต๊ะทำงานจริง (ลาก/ย่อขยาย/จัดตำแหน่ง) — ตัวอย่างในหน้าปกติเป็นแค่ภาพย่อไว้กดเข้ามา
  const [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });

  const maxY = pageMaxY(orientation);
  const ratio = pageRatio(orientation);

  // อ่านขนาดจริงของรูปพื้นหลังที่เก็บไว้ (รูปตัวนี้เบราว์เซอร์โหลดไว้แล้วจากกระดาษ จึงมาจากแคช ไม่ยิงซ้ำ)
  useEffect(() => {
    const url = assetUrl(backgroundId);
    if (!url) {
      setBgSize(null);
      return;
    }
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setBgSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => alive && setBgSize(null);
    img.src = url;
    return () => {
      alive = false;
    };
  }, [backgroundId]);

  const crop = bgCrop(bgSize, orientation);

  const canvasTemplate: CanvasTemplate = {
    orientation,
    backgroundSrc: assetUrl(backgroundId),
    layout,
    signatures: signatures.map((s, i) => ({
      id: i,
      name: s.name,
      roleLabel: s.roleLabel,
      mode: s.mode,
      x: s.x,
      y: s.y,
      width: s.width,
      color: s.color,
      fontSize: s.fontSize,
      imageScale: s.imageScale,
      imageSrc: s.mode === "image" ? assetUrl(s.assetId) : null,
    })),
  };

  const selectedBlock = sel?.kind === "block" ? layout.find((b) => b.id === sel.id) ?? null : null;
  const selectedSig = sel?.kind === "sig" ? signatures[sel.i] ?? null : null;

  // ===== เรขาคณิต: อ่าน/เขียนกรอบของสิ่งที่เลือก =====

  /**
   * กรอบที่ "เห็นบนจอจริง" ของบล็อกหนึ่ง
   * กรอบพอดีข้อความต้องใช้ค่าที่วัดจาก DOM เพราะความกว้างของตัวอักษรไทยคำนวณล่วงหน้าไม่ได้
   * (ยังไม่ทันวัด เช่นเพิ่งเปิดหน้ามา ก็ถอยไปใช้กรอบตามค่า w ที่เก็บไว้ล่าสุด)
   */
  function liveRect(b: CertBlock): Rect {
    return fitRect(b, orientation, textRects[b.id]);
  }

  function rectFor(t: Target): Rect | null {
    if (t.kind === "block") {
      const b = layout.find((x) => x.id === t.id);
      return b ? liveRect(b) : null;
    }
    const s = signatures[t.i];
    return s ? sigRect(s, orientation) : null;
  }

  /** แปลงขอบซ้ายกลับเป็นจุดอ้างอิง x ตาม align (บล็อกจัดกลาง/ชิดขวา นับ x คนละจุดกัน) */
  const anchorX = (align: CertBlock["align"], left: number, w: number) =>
    align === "center" ? left + w / 2 : align === "right" ? left + w : left;

  const clampLeft = (left: number, w: number) => Math.max(0, Math.min(Math.max(0, 100 - w), left));
  const clampTop = (top: number, h: number, my = maxY) => Math.max(0, Math.min(Math.max(0, my - h), top));

  /**
   * เขียนกรอบใหม่กลับเข้าโมเดล — ทางเข้าเดียวของทุกวิธีย้าย (ลาก / ปุ่มจัดตำแหน่ง / ปุ่มลูกศร)
   * ค่าที่เข้ามาต้องผ่าน clamp มาแล้ว เพื่อกันของหลุดออกนอกหน้ากระดาษจนมองไม่เห็น
   */
  function applyRect(t: Target, r: { left: number; top: number; w: number }) {
    if (t.kind === "block") {
      setLayout((L) =>
        L.map((b) =>
          b.id === t.id ? { ...b, w: round(r.w), x: round(anchorX(b.align, r.left, r.w)), y: round(r.top) } : b
        )
      );
    } else {
      setSignatures((S) =>
        S.map((s, i) => (i === t.i ? { ...s, width: round(r.w), x: round(r.left + r.w / 2), y: round(r.top) } : s))
      );
    }
  }

  // ===== ลาก / ย่อขยาย บนกระดาษ =====

  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ move: (e: PointerEvent) => void; up: () => void } | null>(null);

  function stopDrag() {
    const d = dragRef.current;
    if (!d) return;
    window.removeEventListener("pointermove", d.move);
    window.removeEventListener("pointerup", d.up);
    window.removeEventListener("pointercancel", d.up);
    dragRef.current = null;
    setGuides({ v: false, h: false });
  }
  useEffect(() => stopDrag, []);

  function startDrag(e: React.PointerEvent, t: Target, mode: DragMode) {
    e.preventDefault();
    e.stopPropagation();
    setSel(t);
    if (locked) return;

    const el = stageRef.current;
    const rect0 = rectFor(t);
    if (!el || !rect0) return;
    // ระยะที่ลากคิดจาก "พิกัดบนจอ" ล้วน ๆ แล้วหารด้วยความกว้างกระดาษตอนเริ่มลาก
    // ห้ามอิงขอบกระดาษ ณ ขณะนั้น: พอซูมจนกระดาษใหญ่กว่าจอ ช่องที่เลื่อนได้อาจขยับเอง
    // (scroll anchoring / ลากเลยขอบแล้วเบราว์เซอร์เลื่อนให้) ขอบกระดาษก็เลื่อน ชิ้นงานจะกระโดดตาม
    // แล้ววนเป็นลูปจนจอเด้งไปมาคุมไม่ได้
    const w0 = el.getBoundingClientRect().width || 1;
    const startX = e.clientX;
    const startY = e.clientY;
    // ทั้ง x และ y เป็น % ของ "ความกว้าง" หน้า (ตาม CertificateCanvas) ไม่ใช่ % ของความสูง
    const delta = (ev: { clientX: number; clientY: number }) => ({
      x: ((ev.clientX - startX) / w0) * 100,
      y: ((ev.clientY - startY) / w0) * 100,
    });
    const dragged = t.kind === "block" ? layout.find((b) => b.id === t.id) : null;
    const sig0 = t.kind === "sig" ? signatures[t.i] ?? null : null;
    const scale0 = sig0?.imageScale ?? SIG_IMAGE_SCALE_DEFAULT;
    const font0 = dragged?.fontSize ?? 0;
    const isQr = dragged?.kind === "qr"; // QR เป็นสี่เหลี่ยมจัตุรัส ไม่มีตัวอักษรให้ขยาย

    stopDrag();

    // ค่าที่ต้องใช้ระหว่างลากถูกจับภาพไว้แล้วทั้งหมด (rect0/จุดเริ่ม/ความกว้างกระดาษ)
    // การเขียนกลับใช้ setState แบบฟังก์ชัน จึงไม่ต้องกลัวอ่านค่าเก่าค้าง
    const move = (ev: PointerEvent) => {
      const { x: dx, y: dy } = delta(ev);

      if (mode === "move") {
        let left = rect0.left + dx;
        let top = rect0.top + dy;
        // ดูดเข้าเส้นกึ่งกลางหน้ากระดาษ พร้อมโชว์เส้นไกด์ให้เห็นว่ากำลังตรงกลางจริง
        const gv = Math.abs(left + rect0.w / 2 - 50) <= SNAP;
        if (gv) left = 50 - rect0.w / 2;
        const gh = Math.abs(top + rect0.h / 2 - maxY / 2) <= SNAP;
        if (gh) top = maxY / 2 - rect0.h / 2;
        setGuides({ v: gv, h: gh });
        applyRect(t, { left: clampLeft(left, rect0.w), top: clampTop(top, rect0.h), w: rect0.w });
        return;
      }

      if (mode === "resize-l") {
        const right = rect0.left + rect0.w;
        const w = Math.max(MIN_W, right - (rect0.left + dx));
        applyRect(t, { left: clampLeft(right - w, w), top: rect0.top, w });
        return;
      }

      if (mode === "resize-r") {
        const w = Math.max(MIN_W, Math.min(100 - rect0.left, rect0.w + dx));
        applyRect(t, { left: rect0.left, top: rect0.top, w });
        return;
      }

      // scale (มุมขวาล่าง) — ข้อความ: ลากลง = ตัวอักษรโต, ลากขึ้น = เล็กลง
      //
      // ผูกกับ "ความสูง" ไม่ใช่ความกว้าง เพราะกรอบกว้างของบล็อกข้อความคือความกว้างที่ให้ตัดบรรทัด
      // ไม่ใช่ขนาดตัวอักษร ของเดิมผูกกับความกว้างแล้วเจอสองอาการ: กรอบชนขอบขวากระดาษตั้งแต่ยัง
      // โตไม่ทันไร (บล็อกกว้าง 80% โตได้อีกแค่ 10%) และพอกรอบติดแล้วตัวอักษรยังโตต่อจนล้นกรอบ
      // ตอนนี้ความสูงกรอบ = fontSize × LINE_H พอดี ขอบล่างจึงวิ่งตามปลายนิ้วเป๊ะ ๆ
      if (t.kind === "block" && font0 && !isQr) {
        // กรอบกว้างโตตามสัดส่วนไปด้วย เพราะ CertificateCanvas วาดข้อความแบบ nowrap แล้วตัดส่วนที่ล้นกรอบ
        // ถ้าตัวอักษรโตอยู่ฝ่ายเดียว ชื่อยาว ๆ จะโดนตัดหัวท้ายหายไปเงียบ ๆ
        // เพดานคือกรอบเต็มความกว้างกระดาษ — เลยจากนั้นตัวอักษรก็โดนขอบกระดาษตัดอยู่ดี
        const fMax = 100 / Math.max(MIN_W, rect0.w);
        const font = Math.min(MAX_FONT, font0 * fMax, Math.max(MIN_FONT, font0 + dy / LINE_H));
        const w = Math.max(MIN_W, Math.min(100, rect0.w * (font / font0)));
        // ยึดจุดอ้างอิงเดิม (กลาง/ซ้าย/ขวา) ไม่ให้บล็อกที่จัดกลางไหลไปทางขวาทีละนิดทุกครั้งที่ขยาย
        const al = dragged?.align ?? "left";
        const left =
          al === "center"
            ? rect0.left + rect0.w / 2 - w / 2
            : al === "right"
              ? rect0.left + rect0.w - w
              : rect0.left;
        setLayout((L) => L.map((b) => (b.id === t.id ? { ...b, fontSize: round2(font) } : b)));
        applyRect(t, { left: clampLeft(left, w), top: clampTop(rect0.top, font * LINE_H), w });
        return;
      }

      // ลายเซ็นที่เป็นรูป: มุมขวาล่างขยาย "เฉพาะรูป" ตามแนวตั้ง (ลากลง = ใหญ่ขึ้น) เหมือนบล็อกข้อความ
      // ความกว้างกล่องไม่ขยับ ชื่อ/ตำแหน่งจึงอยู่ที่เดิม แค่ถูกดันลงตามความสูงของรูป
      // (จุดซ้าย/ขวายังใช้ปรับความกว้างกล่องได้ตามเดิม)
      if (t.kind === "sig" && sig0?.mode === "image") {
        const base = Math.max(0.5, rect0.w * ratio * 0.5); // ความสูงรูปตอน scale = 1
        const sc = clampSigScale(scale0 + dy / base);
        setSignatures((S) => S.map((s, i) => (i === t.i ? { ...s, imageScale: round2(sc) } : s)));
        return;
      }

      // QR/ลายเซ็นแบบเซ็นสด เป็นสี่เหลี่ยมที่ความกว้างคือขนาดจริง มุมขวาล่างจึงลากตามแนวนอน
      const w = Math.max(MIN_W, Math.min(100 - rect0.left, rect0.w + dx));
      applyRect(t, { left: rect0.left, top: rect0.top, w });
    };

    const up = () => stopDrag();
    dragRef.current = { move, up };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  // ===== ปุ่มช่วยจัดตำแหน่ง =====

  function align(where: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom" | "center") {
    if (!sel || locked) return;
    const r = rectFor(sel);
    if (!r) return;
    let { left, top } = r;
    if (where === "left") left = MARGIN;
    else if (where === "right") left = 100 - MARGIN - r.w;
    else if (where === "hcenter") left = 50 - r.w / 2;
    else if (where === "top") top = MARGIN;
    else if (where === "bottom") top = maxY - MARGIN - r.h;
    else if (where === "vcenter") top = maxY / 2 - r.h / 2;
    else {
      left = 50 - r.w / 2;
      top = maxY / 2 - r.h / 2;
    }
    applyRect(sel, { left: clampLeft(left, r.w), top: clampTop(top, r.h), w: r.w });
  }

  function nudge(dx: number, dy: number) {
    if (!sel || locked) return;
    const r = rectFor(sel);
    if (!r) return;
    applyRect(sel, { left: clampLeft(r.left + dx, r.w), top: clampTop(r.top + dy, r.h), w: r.w });
  }

  function deleteSelected() {
    if (!sel || locked) return;
    if (sel.kind === "block") removeBlock(sel.id);
    else removeSig(sel.i);
  }

  // ===== แก้บล็อกข้อความ =====

  function updateBlock(id: string, patch: Partial<CertBlock>) {
    setLayout((L) => L.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function addBlock(kind: BlockKind) {
    const id = `b${Date.now()}`;
    setLayout((L) => [
      ...L,
      {
        id,
        kind,
        x: 50,
        y: round(maxY * 0.4),
        w: kind === "qr" ? 8 : 60,
        align: "center",
        fontSize: 2,
        font: "th-serif",
        weight: 400,
        color: "#1f2937",
        // ของใหม่ให้กรอบพอดีข้อความไว้ก่อน — จะได้เห็นตั้งแต่แรกว่าข้อความจริงกินที่แค่ไหน
        // (ยกเว้น QR ที่ไม่ใช่ตัวอักษร ความกว้างคือขนาดจริงของรูป)
        ...(kind === "qr" ? {} : { autoFit: true }),
        ...(kind === "static_text" ? { text: "ข้อความ" } : {}),
        ...(kind === "combo" ? { text: "{medal}    {competition_name}" } : {}),
      },
    ]);
    setSel({ kind: "block", id });
  }

  /**
   * สลับโหมดกรอบ — ตอนปิดกรอบพอดีข้อความ ให้ค้างความกว้างไว้เท่าที่ตัวหนังสือกินอยู่จริง
   * ไม่งั้นกรอบจะกระโดดกลับไปเป็นค่า w เก่าที่ตั้งไว้ตั้งแต่เมื่อไหร่ก็ไม่รู้
   */
  function toggleAutoFit(b: CertBlock, on: boolean) {
    const measured = textRects[b.id];
    updateBlock(b.id, {
      autoFit: on,
      ...(on || !measured ? {} : { w: round(Math.max(MIN_W, measured.w)), x: round(anchorX(b.align, measured.left, measured.w)) }),
    });
  }

  function removeBlock(id: string) {
    setLayout((L) => L.filter((b) => b.id !== id));
    setSel(null);
  }

  /** เปลี่ยนแนวกระดาษแล้วดึงของที่ตกขอบล่างกลับเข้าหน้า (แนวนอนเตี้ยกว่าแนวตั้งครึ่งหนึ่ง) */
  function changeOrientation(o: Orientation) {
    setOrientation(o);
    const my = pageMaxY(o);
    setLayout((L) =>
      L.map((b) => {
        const r = blockRect(b, o);
        const top = clampTop(r.top, r.h, my);
        return top === r.top ? b : { ...b, y: round(top) };
      })
    );
    setSignatures((S) =>
      S.map((s) => {
        const r = sigRect(s, o);
        const top = clampTop(r.top, r.h, my);
        return top === r.top ? s : { ...s, y: round(top) };
      })
    );
  }

  // ===== จัดหน้าอัตโนมัติ =====
  // จัดข้อความเรียงกลางหน้าจากบนลงล่างแบบกระจายเท่า ๆ กัน, เลขทะเบียน/QR ไปมุมล่าง,
  // ผู้ลงนามกระจายตามแนวล่าง — เก็บฟอนต์/สี/ขนาดเดิมของผู้ใช้ไว้ ปรับแค่ตำแหน่ง
  async function autoArrange() {
    if (locked) return;
    const ok = await confirm({
      title: "จัดหน้าอัตโนมัติ",
      message: "ระบบจะจัดตำแหน่งข้อความ ผู้ลงนาม เลขทะเบียน และ QR ใหม่ให้เข้าที่ (ขนาดฟอนต์และสีเดิมไม่เปลี่ยน) ยืนยัน?",
      confirmText: "จัดให้เลย",
    });
    if (!ok) return;

    setLayout((L) => {
      const stack = L.filter((b) => b.kind !== "qr" && b.kind !== "serial");
      const top = maxY * 0.1,
        bottom = maxY * 0.62;
      const step = stack.length > 1 ? (bottom - top) / (stack.length - 1) : 0;
      const patched = new Map<string, CertBlock>();
      stack.forEach((b, i) => patched.set(b.id, { ...b, x: 50, align: "center", y: round(top + step * i) }));
      L.forEach((b) => {
        if (b.kind === "qr") patched.set(b.id, { ...b, x: 92, y: round(maxY * 0.82), align: "right" });
        else if (b.kind === "serial") patched.set(b.id, { ...b, x: 8, y: round(maxY * 0.95), align: "left" });
      });
      return L.map((b) => patched.get(b.id) ?? b);
    });

    setSignatures((S) =>
      S.map((s, i) => ({
        ...s,
        x: S.length <= 1 ? 50 : round(22 + (56 / (S.length - 1)) * i),
        y: round(maxY * 0.72),
      }))
    );
    toast("จัดหน้าให้แล้ว — ลากปรับเพิ่มได้ตามต้องการ");
  }

  // ===== อัปโหลดรูป =====

  async function uploadResult(c: CompressResult, kind: "background" | "signature", name: string): Promise<number | null> {
    const res = await api.post<{ id: number }>("/api/admin/certificate-assets", {
      kind,
      name,
      mime: c.mime,
      data: c.data,
      width: c.width,
      height: c.height,
    });
    if (!res.ok) {
      await alert(res.error, { title: "อัปโหลดไม่สำเร็จ", danger: true });
      return null;
    }
    return res.data.id;
  }

  async function uploadAsset(file: File, kind: "background" | "signature"): Promise<number | null> {
    try {
      const c = await compressImage(file, presetFor(kind));
      return await uploadResult(c, kind, file.name);
    } catch (e) {
      await alert(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ", { title: "อัปโหลดไม่สำเร็จ", danger: true });
      return null;
    }
  }

  async function onBgFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    const id = await uploadAsset(f, "background");
    setBusy(false);
    if (id) setBackgroundId(id);
  }

  /**
   * ลายเซ็นไม่อัปโหลดทันทีที่เลือกไฟล์ — เปิดกล่องปรับก่อน (ลบพื้นกระดาษ/เปลี่ยนสีหมึก)
   * เพราะรูปที่ครูส่งมาส่วนใหญ่เป็นภาพถ่ายลายเซ็นบนกระดาษ เอาลงเกียรติบัตรตรง ๆ จะได้กล่องขาวทับพื้นหลัง
   */
  function onSigFile(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setSigTune({ i: idx, src: f, initial: SIG_TUNE_NEW, name: f.name });
  }

  /** ปรับรูปที่อัปโหลดไว้แล้ว โดยไม่ต้องหาไฟล์ต้นฉบับมาใหม่ (เช่น เซ็นมาสีดำ แต่อยากได้น้ำเงิน) */
  function editSigImage(idx: number) {
    const url = assetUrl(signatures[idx]?.assetId ?? null);
    if (!url) return;
    setSigTune({ i: idx, src: url, initial: SIG_TUNE_SAVED, name: `signature-${idx + 1}.webp` });
  }

  async function applySigResult(c: CompressResult) {
    const t = sigTune;
    if (!t) return;
    setSigTune(null);
    setBusy(true);
    const id = await uploadResult(c, "signature", t.name);
    setBusy(false);
    if (id) setSignatures((S) => S.map((s, i) => (i === t.i ? { ...s, assetId: id, mode: "image" } : s)));
  }

  // ===== ผู้ลงนาม =====

  /**
   * คนใหม่ต้องโผล่ "ในหน้ากระดาษ" เสมอ — y เป็น % ของความกว้างหน้า ขอบล่างแนวนอนอยู่แค่ ~70.7
   * ค่าคงที่อย่าง y = 80 จึงตกนอกหน้า ทั้งลายเซ็นและกรอบสำหรับลากเลยหายไปทั้งคู่
   */
  function addSig() {
    const n = signatures.length;
    setSignatures((S) => [
      ...S,
      {
        name: "",
        roleLabel: "",
        mode: "blank",
        assetId: null,
        x: Math.min(85, 20 + 15 * n),
        y: round(maxY * 0.72),
        width: 16,
        // สืบสี/ขนาดจากคนก่อนหน้า — ตั้งไว้ให้เข้ากับพื้นหลังแล้ว จะได้ไม่ต้องมาตั้งใหม่ทุกคน
        color: S[S.length - 1]?.color ?? "#1f2937",
        fontSize: S[S.length - 1]?.fontSize ?? SIG_FONT_DEFAULT,
        imageScale: SIG_IMAGE_SCALE_DEFAULT,
      },
    ]);
    setSel({ kind: "sig", i: n });
  }

  function updateSig(idx: number, patch: Partial<SigEdit>) {
    setSignatures((S) => S.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeSig(idx: number) {
    setSignatures((S) => S.filter((_, i) => i !== idx));
    setSel(null);
  }

  // ===== บันทึก =====

  /** บันทึกจริง — คืน true เมื่อสำเร็จ (ตอนสำเร็จไม่เด้ง modal เอง ให้ผู้เรียกตัดสินใจ) */
  async function persist(): Promise<boolean> {
    setBusy(true);
    const res = await api.put(`/api/admin/certificate-events/${eventId}/template`, {
      medalFilter: "",
      backgroundAssetId: backgroundId,
      orientation,
      layout,
      signatures,
    });
    setBusy(false);
    if (!res.ok) {
      await alert(res.error, { title: "บันทึกไม่สำเร็จ", danger: true });
      return false;
    }
    return true;
  }

  // พื้นหลังไม่ใช่เงื่อนไขของการบันทึก — วางข้อความค้างไว้ก่อนแล้วค่อยหาไฟล์พื้นหลังทีหลังได้
  // (ที่ยังบังคับว่าต้องมีพื้นหลังคือตอน "เผยแพร่" ซึ่งเป็นจุดที่ครูเริ่มออกใบจริง)
  async function saveTemplate() {
    if (!(await persist())) return;
    await alert(
      backgroundId
        ? "บันทึกแม่แบบเรียบร้อยแล้ว"
        : "บันทึกแม่แบบเรียบร้อยแล้ว (ยังไม่ได้ใส่พื้นหลัง — ค่อยใส่ทีหลังได้ แต่ต้องมีก่อนกดเผยแพร่)",
      { title: "บันทึกแล้ว" }
    );
  }

  /**
   * ทดลองพิมพ์ 1 ใบ — บันทึกก่อน แล้วเปิดใบตัวอย่างในแท็บใหม่ (หน้านั้นสั่งพิมพ์ให้เอง)
   * ต้องเปิดแท็บตั้งแต่จังหวะที่ผู้ใช้กด ไม่งั้นเบราว์เซอร์บล็อกป๊อปอัปที่เปิดหลัง await
   */
  async function testPrint() {
    const w = window.open("", "_blank");
    if (!locked && !(await persist())) {
      w?.close();
      return;
    }
    const url = `${BASE}/certificates/print/sample?eventId=${eventId}`;
    if (w) w.location.href = url;
    else await alert("เบราว์เซอร์บล็อกการเปิดแท็บใหม่ กรุณาอนุญาตป๊อปอัปของเว็บนี้แล้วลองอีกครั้ง", { danger: true });
  }

  async function changeStatus(action: "publish" | "unpublish" | "unlock") {
    if (action === "unlock") {
      const ok = await confirm({
        title: "ปลดล็อกเพื่อแก้ไข",
        message:
          "งานนี้ออกเกียรติบัตรไปแล้ว หากแก้ดีไซน์ ใบที่พิมพ์ซ้ำหลังจากนี้จะหน้าตาต่างจากใบที่แจกไปแล้ว (เลขทะเบียนเดิม) ยืนยันปลดล็อก?",
        confirmText: "ปลดล็อก",
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    const res = await api.post(`/api/admin/certificate-events/${eventId}/publish`, { action });
    setBusy(false);
    if (!res.ok) {
      await alert(res.error, { title: "ทำรายการไม่สำเร็จ", danger: true });
      return;
    }
    setStatus(action === "publish" ? "published" : action === "unlock" ? "published" : "draft");
    await alert(action === "publish" ? "เผยแพร่แล้ว ครูเริ่มออกเกียรติบัตรได้" : "อัปเดตสถานะแล้ว", {
      title: "เรียบร้อย",
    });
    router.refresh();
  }

  // ===== โหมดเต็มจอ: ขนาดกระดาษให้พอดีจอ + คีย์ลัด =====

  const fsBodyRef = useRef<HTMLDivElement>(null);
  const [fsBox, setFsBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!full) return;
    const el = fsBodyRef.current;
    if (!el) return;
    const measure = () => setFsBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [full]);

  /**
   * ซูมแล้วต้องยังมองจุดเดิมอยู่ — จำว่ากลางจอตรงกับตำแหน่งไหนของกระดาษ (เป็นสัดส่วน 0..1)
   * แล้วเลื่อนกลับมาให้ตรงจุดนั้นหลังกระดาษเปลี่ยนขนาด ไม่งั้นกด + ทีเดียวหลุดไปมองมุมกระดาษ
   */
  const zoomAnchor = useRef<{ fx: number; fy: number } | null>(null);
  function changeZoom(next: number) {
    const body = fsBodyRef.current;
    const st = stageRef.current;
    if (body && st) {
      const b = body.getBoundingClientRect();
      const s = st.getBoundingClientRect();
      zoomAnchor.current = {
        fx: (b.left + b.width / 2 - s.left) / s.width,
        fy: (b.top + b.height / 2 - s.top) / s.height,
      };
    }
    setZoom(round2(Math.min(2.5, Math.max(0.5, next))));
  }
  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    zoomAnchor.current = null;
    const body = fsBodyRef.current;
    const st = stageRef.current;
    if (!a || !body || !st) return;
    const b = body.getBoundingClientRect();
    const s = st.getBoundingClientRect();
    body.scrollLeft += s.left + a.fx * s.width - (b.left + b.width / 2);
    body.scrollTop += s.top + a.fy * s.height - (b.top + b.height / 2);
  }, [zoom]);

  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [full]);

  // ผูกใหม่ทุกรอบ render โดยตั้งใจ — ปุ่มลูกศร/Delete ต้องทำงานกับสิ่งที่เลือกอยู่ ณ ตอนนั้น
  useEffect(() => {
    if (!full) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) return;
      if (e.key === "Escape") {
        setFull(false);
        return;
      }
      const step = e.shiftKey ? 2 : 0.5;
      if (e.key === "ArrowLeft") { e.preventDefault(); nudge(-step, 0); }
      else if (e.key === "ArrowRight") { e.preventDefault(); nudge(step, 0); }
      else if (e.key === "ArrowUp") { e.preventDefault(); nudge(0, -step); }
      else if (e.key === "ArrowDown") { e.preventDefault(); nudge(0, step); }
      else if (e.key === "Delete") { e.preventDefault(); deleteSelected(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const fitW = fsBox.w && fsBox.h ? Math.min(fsBox.w - 24, (fsBox.h - 24) / ratio) : 0;

  function labelOf(t: Target) {
    if (t.kind === "sig") return `ผู้ลงนามคนที่ ${t.i + 1}`;
    const b = layout.find((x) => x.id === t.id);
    return b ? BLOCK_LABEL[b.kind] : "";
  }

  const stageCommon = {
    template: canvasTemplate,
    data: props.sample,
    qrSvg: props.sampleQrSvg,
    orientation,
    layout,
    signatures,
    sel,
    guides,
    textRects,
    labelOf,
    onDeselect: () => setSel(null),
    onDown: startDrag,
  };

  // ===== หน้าจอ =====

  return (
    <div className="stack">
      <div className="page-header row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>{props.event.name}</h1>
          <div className="subtitle">
            ปีการศึกษา {props.yearBe} · สถานะ: {STATUS_TH[status] ?? status}
          </div>
        </div>
        <a className="btn" href={`${BASE}/admin/certificates`}>
          <Icon name="chart" size={16} /> กลับ
        </a>
      </div>

      {locked && (
        <div className="alert alert-warning">
          งานนี้ถูกล็อกเพราะออกเกียรติบัตรไปแล้ว — แก้ไขดีไซน์ไม่ได้จนกว่าจะปลดล็อก
        </div>
      )}

      <div className="cert-editor-grid">
        {/* ซ้าย: แผงตั้งค่า */}
        <div className="stack">
          {/* รายการแข่งขันในงานนี้ (อ่านอย่างเดียว — จัดการที่หน้าสร้าง/แก้รายการ) */}
          <details className="card">
            <summary>
              <strong>1. รายการในงานนี้</strong> ({props.competitions.length})
            </summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="subtitle">กำหนดว่ารายการอยู่งานไหน ได้ที่หน้าสร้าง/แก้รายการแข่งขัน</div>
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {props.competitions.length === 0 && <div className="subtitle">ยังไม่มีรายการในงานนี้</div>}
                {props.competitions.map((c) => (
                  <div key={c.id} className="row" style={{ gap: 8, padding: "4px 0", alignItems: "center" }}>
                    <span>{c.name}</span>
                    {!c.isPublished && <span className="badge" style={{ marginInlineStart: "auto" }}>ยังไม่ประกาศผล</span>}
                  </div>
                ))}
              </div>
            </div>
          </details>

          {/* พื้นหลัง */}
          <details className="card" open>
            <summary>
              <strong>2. พื้นหลัง</strong>
            </summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="form-row">
                <label className="field">
                  <span>แนวกระดาษ</span>
                  <select value={orientation} onChange={(e) => changeOrientation(e.target.value as Orientation)} disabled={locked}>
                    <option value="landscape">แนวนอน</option>
                    <option value="portrait">แนวตั้ง</option>
                  </select>
                </label>
              </div>
              <label className="btn btn-sm" style={{ display: "inline-flex", cursor: locked ? "not-allowed" : "pointer" }}>
                <Icon name="download" size={16} /> {backgroundId ? "เปลี่ยนพื้นหลัง" : "อัปโหลดพื้นหลัง"}
                <input type="file" accept="image/*" hidden onChange={onBgFile} disabled={locked} />
              </label>
              <div className="subtitle">
                ระบบย่อรูปเป็น WebP กว้างสูงสุด 1754px ให้อัตโนมัติก่อนอัปโหลด · รูปสัดส่วนไหนก็เต็มหน้าเสมอ ไม่ยืดบิดเบี้ยว
                {!backgroundId && " · ยังไม่มีพื้นหลัง — บันทึกงานค้างไว้ก่อนได้ แต่ต้องใส่ก่อนเผยแพร่"}
              </div>
              {crop && (
                <div className="subtitle" style={{ color: "var(--color-warning)" }}>
                  รูปนี้ {bgSize?.w}×{bgSize?.h} สัดส่วนไม่ตรง A4{orientation === "portrait" ? "แนวตั้ง" : "แนวนอน"} — ขยายเต็มหน้าแล้วครอบตัด{crop.side}ออกข้างละ ~{crop.pct}%
                  {" "}ถ้าลายกรอบขอบรูปสำคัญ ให้ครอปรูปเป็นสัดส่วน A4 ({orientation === "portrait" ? "210×297" : "297×210"}) มาก่อนอัปโหลด
                </div>
              )}
            </div>
          </details>

          {/* ข้อความ */}
          <details className="card" open>
            <summary>
              <strong>3. ตำแหน่งข้อความ</strong>
            </summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <select
                  id="add-block"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addBlock(e.target.value as BlockKind);
                      e.target.value = "";
                    }
                  }}
                  disabled={locked}
                >
                  <option value="" disabled>
                    + เพิ่มข้อความ…
                  </option>
                  {BLOCK_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {BLOCK_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="stack" style={{ gap: 4 }}>
                {layout.map((b) => (
                  <button
                    key={b.id}
                    className={`btn btn-sm ${selectedBlock?.id === b.id ? "btn-primary" : ""}`}
                    style={{ justifyContent: "flex-start" }}
                    onClick={() => setSel({ kind: "block", id: b.id })}
                  >
                    {BLOCK_LABEL[b.kind]}
                    {b.kind === "static_text" && b.text ? `: ${b.text}` : ""}
                  </button>
                ))}
              </div>

              {selectedBlock && (
                <div className="card stack" style={{ gap: 8, background: "var(--surface-2, #f8fafc)" }}>
                  <strong>{BLOCK_LABEL[selectedBlock.kind]}</strong>
                  {selectedBlock.kind === "static_text" && (
                    <label className="field">
                      <span>ข้อความ</span>
                      <input value={selectedBlock.text ?? ""} onChange={(e) => updateBlock(selectedBlock.id, { text: e.target.value })} />
                    </label>
                  )}
                  {selectedBlock.kind === "combo" && (
                    <div className="stack" style={{ gap: 4 }}>
                      <strong>ข้อความ + ช่องข้อมูล</strong>
                      <ComboField
                        value={selectedBlock.text ?? ""}
                        onChange={(v) => updateBlock(selectedBlock.id, { text: v })}
                        block
                      />
                      <div className="subtitle">
                        รวมหลายช่องไว้บรรทัดเดียว เช่น <code>{"{medal}    {competition_name}"}</code> · เว้นวรรคที่เคาะเองไม่ถูกยุบ
                        ใช้คั่นระยะได้เลย · ช่องที่ไม่มีข้อมูล (เช่นไม่มีชื่อทีม) หายไปทั้งช่องพร้อมช่องว่างที่ตามหลัง
                      </div>
                    </div>
                  )}
                  {selectedBlock.kind !== "qr" && (
                    <>
                      <label className="row" style={{ gap: 6, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={selectedBlock.autoFit === true}
                          onChange={(e) => toggleAutoFit(selectedBlock, e.target.checked)}
                          disabled={locked}
                        />
                        <span>กรอบพอดีข้อความ</span>
                      </label>
                      <div className="subtitle">
                        เปิดไว้ = กรอบฟ้าเท่ากับตัวหนังสือจริง จัดชิดซ้าย/ขวาแล้วได้ตำแหน่งที่เห็นเป๊ะ ๆ ·
                        ปิด = กรอบกว้างคงที่ตามค่า “กว้าง %” แล้วจัดข้อความในกรอบตาม “จัดวาง”
                      </div>
                      <label className="row" style={{ gap: 6, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={blockShrinks(selectedBlock)}
                          onChange={(e) => updateBlock(selectedBlock.id, { shrink: e.target.checked })}
                          disabled={locked}
                        />
                        <span>ย่อให้พอดีกรอบเมื่อข้อความยาว</span>
                      </label>
                      <div className="subtitle">
                        ชื่อยาว ๆ จะย่อขนาดตัวอักษรลงจนพอดี — ยังอยู่บรรทัดเดียวและอยู่กลางกรอบเหมือนเดิม
                        ไม่ตัดคำ ไม่ขึ้นบรรทัดใหม่ · กรอบพอดีข้อความก็ย่อ แต่ยึดขอบกระดาษเป็นเพดานแทนค่า “กว้าง %”
                        · ปิด = ยาวเกินกรอบแล้วโดนตัดหัวท้ายหายแบบเดิม
                      </div>
                      <div className="form-row">
                        <label className="field">
                          <span>ขนาดฟอนต์</span>
                          <input
                            type="number"
                            step="0.1"
                            value={selectedBlock.fontSize}
                            onChange={(e) => updateBlock(selectedBlock.id, { fontSize: Number(e.target.value) })}
                          />
                        </label>
                        <label className="field">
                          <span>น้ำหนัก</span>
                          <select value={selectedBlock.weight} onChange={(e) => updateBlock(selectedBlock.id, { weight: Number(e.target.value) })}>
                            {[300, 400, 500, 600, 700].map((w) => (
                              <option key={w} value={w}>
                                {w}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="form-row">
                        <label className="field">
                          <span>จัดวาง</span>
                          <select
                            value={selectedBlock.align}
                            onChange={(e) => updateBlock(selectedBlock.id, { align: e.target.value as CertBlock["align"] })}
                          >
                            <option value="left">ซ้าย</option>
                            <option value="center">กลาง</option>
                            <option value="right">ขวา</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>ฟอนต์</span>
                          <select
                            value={selectedBlock.font}
                            onChange={(e) => updateBlock(selectedBlock.id, { font: e.target.value as CertBlock["font"] })}
                          >
                            <option value="th-serif">มีเชิง</option>
                            <option value="th-sans">ไม่มีเชิง</option>
                            <option value="th-modern">โมเดิร์น</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>สี</span>
                          <input type="color" value={selectedBlock.color} onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })} />
                        </label>
                      </div>
                    </>
                  )}
                  <div className="form-row">
                    <label className="field">
                      <span>X %</span>
                      <input type="number" step="0.5" value={selectedBlock.x} onChange={(e) => updateBlock(selectedBlock.id, { x: Number(e.target.value) })} />
                    </label>
                    <label className="field">
                      <span>Y %</span>
                      <input type="number" step="0.5" value={selectedBlock.y} onChange={(e) => updateBlock(selectedBlock.id, { y: Number(e.target.value) })} />
                    </label>
                    <label className="field">
                      <span>กว้าง %</span>
                      <input
                        type="number"
                        step="0.5"
                        value={isFit(selectedBlock) ? round(liveRect(selectedBlock).w) : selectedBlock.w}
                        onChange={(e) => updateBlock(selectedBlock.id, { w: Number(e.target.value) })}
                        disabled={isFit(selectedBlock)}
                        title={isFit(selectedBlock) ? "กรอบพอดีข้อความ — ความกว้างมาจากตัวอักษร" : undefined}
                      />
                    </label>
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => removeBlock(selectedBlock.id)} disabled={locked}>
                    ลบข้อความนี้
                  </button>
                </div>
              )}
            </div>
          </details>

          {/* ลายเซ็น */}
          <details className="card" open>
            <summary>
              <strong>4. ผู้ลงนาม</strong> ({signatures.length})
            </summary>
            <div className="stack" style={{ marginTop: 12 }}>
              {signatures.map((s, i) => (
                <div
                  key={i}
                  className={`card stack${sel?.kind === "sig" && sel.i === i ? " cert-sig-active" : ""}`}
                  style={{ gap: 8, background: "var(--surface-2, #f8fafc)" }}
                  onClick={() => setSel({ kind: "sig", i })}
                >
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>ผู้ลงนามคนที่ {i + 1}</strong>
                    <button className="btn btn-sm btn-danger" onClick={() => removeSig(i)} disabled={locked}>
                      ลบ
                    </button>
                  </div>
                  <label className="field">
                    <span>ชื่อ</span>
                    <input value={s.name} onChange={(e) => updateSig(i, { name: e.target.value })} placeholder="เช่น นายสมชาย ใจดี" />
                  </label>
                  <label className="field">
                    <span>ตำแหน่ง</span>
                    <input value={s.roleLabel} onChange={(e) => updateSig(i, { roleLabel: e.target.value })} placeholder="เช่น ผู้อำนวยการโรงเรียน" />
                  </label>
                  <div className="form-row">
                    <label className="field">
                      <span>รูปแบบ</span>
                      <select value={s.mode} onChange={(e) => updateSig(i, { mode: e.target.value as "image" | "blank" })}>
                        <option value="blank">เว้นเส้นเซ็นสด</option>
                        <option value="image">ลายเซ็นดิจิทัล (รูป)</option>
                      </select>
                    </label>
                    {s.mode === "image" && (
                      <label className="btn btn-sm" style={{ alignSelf: "flex-end", cursor: "pointer" }}>
                        {s.assetId ? "เปลี่ยนรูป" : "อัปโหลด"}
                        <input type="file" accept="image/*" hidden onChange={(e) => onSigFile(i, e)} />
                      </label>
                    )}
                    {s.mode === "image" && s.assetId != null && (
                      <button
                        className="btn btn-sm"
                        style={{ alignSelf: "flex-end" }}
                        onClick={() => editSigImage(i)}
                        disabled={locked}
                        title="ลบพื้นหลัง / เปลี่ยนสีหมึกของรูปลายเซ็น"
                      >
                        ลบพื้น/เปลี่ยนสี
                      </button>
                    )}
                    <label className="field">
                      <span>สี</span>
                      <input type="color" value={s.color} onChange={(e) => updateSig(i, { color: e.target.value })} />
                    </label>
                    <label className="field">
                      <span>ขนาดชื่อ %</span>
                      <input
                        type="number"
                        step="0.1"
                        min={MIN_FONT}
                        value={s.fontSize}
                        onChange={(e) => updateSig(i, { fontSize: clampFont(Number(e.target.value)) })}
                      />
                    </label>
                  </div>
                  <div className="subtitle">
                    สีนี้ใช้กับชื่อ ตำแหน่ง และเส้นสำหรับเซ็นสด · บรรทัด “ตำแหน่ง” ย่อตามขนาดชื่อให้เอง ·
                    สีของ<strong>รูปลายเซ็น</strong>ปรับที่ปุ่ม “ลบพื้น/เปลี่ยนสี”
                  </div>
                  <div className="form-row">
                    <label className="field">
                      <span>X %</span>
                      <input type="number" step="0.5" value={s.x} onChange={(e) => updateSig(i, { x: Number(e.target.value) })} />
                    </label>
                    <label className="field">
                      <span>Y %</span>
                      <input type="number" step="0.5" value={s.y} onChange={(e) => updateSig(i, { y: Number(e.target.value) })} />
                    </label>
                    <label className="field">
                      <span>กว้าง %</span>
                      <input type="number" step="0.5" value={s.width} onChange={(e) => updateSig(i, { width: Number(e.target.value) })} />
                    </label>
                    {s.mode === "image" && (
                      <label className="field">
                        <span>ขนาดลายเซ็น %</span>
                        <input
                          type="number"
                          step="5"
                          min={SIG_IMAGE_SCALE_MIN * 100}
                          max={SIG_IMAGE_SCALE_MAX * 100}
                          value={Math.round(s.imageScale * 100)}
                          onChange={(e) => updateSig(i, { imageScale: clampSigScale(Number(e.target.value) / 100) })}
                        />
                      </label>
                    )}
                  </div>
                  {s.mode === "image" && (
                    <div className="subtitle">
                      “ขนาดลายเซ็น” ขยายเฉพาะรูป ไม่ดันชื่อ/ตำแหน่งให้เพี้ยน (100% = เท่ากรอบเดิม) · ในโหมดเต็มจอลากจุดมุมขวาล่างของลายเซ็นขึ้น/ลงก็ได้
                    </div>
                  )}
                </div>
              ))}
              {signatures.length < 6 && (
                <button className="btn btn-sm" onClick={addSig} disabled={locked}>
                  <Icon name="plus" size={16} /> เพิ่มผู้ลงนาม
                </button>
              )}
            </div>
          </details>

          {/* บันทึก + ทดลองพิมพ์ + เผยแพร่ */}
          <div className="card stack">
            <button className="btn btn-primary" onClick={saveTemplate} disabled={busy || locked}>
              <Icon name="pencil" size={16} /> บันทึกแม่แบบ
            </button>
            <button className="btn" onClick={testPrint} disabled={busy}>
              <Icon name="printer" size={16} /> ทดลองพิมพ์ 1 ใบ
            </button>
            <div className="subtitle">ใบทดลองเป็นเลขทะเบียน {props.yearBe}/0000 ซึ่งไม่ใช่เลขของใบจริง</div>
            {status === "draft" && (
              <button className="btn" onClick={() => changeStatus("publish")} disabled={busy}>
                เผยแพร่ให้ครูออกได้
              </button>
            )}
            {status === "published" && (
              <button className="btn" onClick={() => changeStatus("unpublish")} disabled={busy}>
                ยกเลิกเผยแพร่
              </button>
            )}
            {status === "locked" && (
              <button className="btn btn-danger" onClick={() => changeStatus("unlock")} disabled={busy}>
                ปลดล็อกเพื่อแก้ไข
              </button>
            )}
          </div>
        </div>

        {/* ขวา: ภาพย่อ — กดแล้วเข้าโหมดเต็มจอเพื่อลาก/ปรับขนาด */}
        <div className="stack cert-preview-col">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div className="subtitle">ตัวอย่าง — ใช้ชื่อที่ยาวที่สุดจากรายการในงาน</div>
            <button className="btn btn-sm btn-primary" onClick={() => setFull(true)} style={{ flexShrink: 0 }}>
              <Icon name="dashboard" size={16} /> เปิดเต็มจอเพื่อจัดหน้า
            </button>
          </div>
          <button type="button" className="cert-preview-click" onClick={() => setFull(true)} title="คลิกเพื่อเปิดหน้าใหญ่แล้วลากจัดตำแหน่ง">
            <AutoWidth ratio={ratio}>{(w) => <CertStage {...stageCommon} w={w} interactive={false} />}</AutoWidth>
            <span className="cert-preview-hint">คลิกเพื่อเปิดหน้าใหญ่แล้วลากจัดตำแหน่ง</span>
          </button>
        </div>
      </div>

      {/* ===== โหมดเต็มจอ =====
          portal ไป body — ถ้า render ในหน้า ancestor ที่มี transform animation (.route-fade) จะทำให้
          position:fixed ยึดกับกล่องเนื้อหาแทน viewport → กระดาษไปลอยกลางความสูงของหน้า ต้องเลื่อนหา
          และพอคลิกชิ้นงาน เบราว์เซอร์จะเลื่อนหน้าไปหาเองจนจอเด้ง */}
      {full && createPortal(
        <div className="cert-fs">
          <div className="cert-fs-bar">
            <strong style={{ marginInlineEnd: "auto" }}>{props.event.name}</strong>
            <span className="cert-zoom">
              <button className="btn btn-sm" onClick={() => changeZoom(zoom - 0.1)} title="ย่อ">
                −
              </button>
              <span className="cert-zoom-val">{Math.round(zoom * 100)}%</span>
              <button className="btn btn-sm" onClick={() => changeZoom(zoom + 0.1)} title="ขยาย">
                +
              </button>
              <button className="btn btn-sm" onClick={() => changeZoom(1)} title="ให้พอดีจอ">
                พอดีจอ
              </button>
            </span>
            <button className="btn btn-sm" onClick={autoArrange} disabled={locked}>
              <Icon name="dashboard" size={16} /> จัดอัตโนมัติ
            </button>
            <button className="btn btn-sm btn-primary" onClick={saveTemplate} disabled={busy || locked}>
              <Icon name="pencil" size={16} /> บันทึก
            </button>
            <button className="btn btn-sm" onClick={testPrint} disabled={busy}>
              <Icon name="printer" size={16} /> ทดลองพิมพ์
            </button>
            <button className="btn btn-sm" onClick={() => setFull(false)}>
              <Icon name="close" size={16} /> ปิด (Esc)
            </button>
          </div>

          {/* แถบเครื่องมือของสิ่งที่เลือกอยู่ */}
          <div className="cert-fs-tools">
            {!sel && <span className="subtitle">คลิกข้อความหรือผู้ลงนามบนกระดาษเพื่อเลือก แล้วลากย้าย · ลากมุมเพื่อปรับขนาด</span>}
            {sel && (
              <>
                <strong className="cert-tool-name">{labelOf(sel)}</strong>

                <span className="cert-tool-sep" />
                <span className="cert-tool-label">จัดตำแหน่ง</span>
                <button className="btn btn-sm" onClick={() => align("left")} title="ชิดขอบซ้าย">⇤</button>
                <button className="btn btn-sm" onClick={() => align("hcenter")} title="กึ่งกลางแนวนอน">⇹</button>
                <button className="btn btn-sm" onClick={() => align("right")} title="ชิดขอบขวา">⇥</button>
                <button className="btn btn-sm" onClick={() => align("top")} title="ชิดขอบบน">⇡</button>
                <button className="btn btn-sm" onClick={() => align("vcenter")} title="กึ่งกลางแนวตั้ง">⇕</button>
                <button className="btn btn-sm" onClick={() => align("bottom")} title="ชิดขอบล่าง">⇣</button>
                <button className="btn btn-sm" onClick={() => align("center")} title="กึ่งกลางหน้ากระดาษ">
                  กลางหน้า
                </button>

                {selectedBlock && selectedBlock.kind !== "qr" && (
                  <>
                    <span className="cert-tool-sep" />
                    <span className="cert-tool-label">ตัวอักษร</span>
                    <button
                      className="btn btn-sm"
                      onClick={() => updateBlock(selectedBlock.id, { fontSize: round2(Math.max(0.3, selectedBlock.fontSize - 0.2)) })}
                    >
                      ก−
                    </button>
                    <input
                      className="cert-tool-num"
                      type="number"
                      step="0.1"
                      value={selectedBlock.fontSize}
                      onChange={(e) => updateBlock(selectedBlock.id, { fontSize: Number(e.target.value) })}
                    />
                    <button className="btn btn-sm" onClick={() => updateBlock(selectedBlock.id, { fontSize: round2(selectedBlock.fontSize + 0.2) })}>
                      ก+
                    </button>
                    <select
                      value={selectedBlock.align}
                      onChange={(e) => updateBlock(selectedBlock.id, { align: e.target.value as CertBlock["align"] })}
                      title="การจัดข้อความในกรอบ"
                    >
                      <option value="left">ชิดซ้าย</option>
                      <option value="center">กึ่งกลาง</option>
                      <option value="right">ชิดขวา</option>
                    </select>
                    <select
                      value={selectedBlock.weight}
                      onChange={(e) => updateBlock(selectedBlock.id, { weight: Number(e.target.value) })}
                      title="น้ำหนักตัวอักษร"
                    >
                      {[300, 400, 500, 600, 700].map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </select>
                    <input
                      type="color"
                      value={selectedBlock.color}
                      onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })}
                      title="สีตัวอักษร"
                    />
                    <button
                      className={`btn btn-sm${selectedBlock.autoFit ? " btn-primary" : ""}`}
                      onClick={() => toggleAutoFit(selectedBlock, !selectedBlock.autoFit)}
                      disabled={locked}
                      title="กรอบฟ้าเท่ากับตัวหนังสือจริง — จัดชิดซ้าย/ขวาได้ตรงตำแหน่ง ไม่มีที่ว่างเหลือในกรอบ"
                    >
                      พอดีข้อความ
                    </button>
                    <button
                      className={`btn btn-sm${blockShrinks(selectedBlock) ? " btn-primary" : ""}`}
                      onClick={() => updateBlock(selectedBlock.id, { shrink: !blockShrinks(selectedBlock) })}
                      disabled={locked}
                      title="ข้อความยาวเกินกรอบให้ย่อตัวอักษรลงจนพอดี — ไม่ตัดคำ ไม่ขึ้นบรรทัดใหม่"
                    >
                      ย่อพอดีกรอบ
                    </button>
                  </>
                )}

                {selectedBlock?.kind === "static_text" && (
                  <input
                    className="cert-tool-text"
                    value={selectedBlock.text ?? ""}
                    onChange={(e) => updateBlock(selectedBlock.id, { text: e.target.value })}
                    placeholder="ข้อความ"
                  />
                )}

                {selectedBlock?.kind === "combo" && (
                  <ComboField
                    value={selectedBlock.text ?? ""}
                    onChange={(v) => updateBlock(selectedBlock.id, { text: v })}
                  />
                )}

                {sel.kind === "sig" && selectedSig && (
                  <>
                    <span className="cert-tool-sep" />
                    <input
                      className="cert-tool-text"
                      value={selectedSig.name}
                      onChange={(e) => updateSig(sel.i, { name: e.target.value })}
                      placeholder="ชื่อผู้ลงนาม"
                    />
                    <input
                      className="cert-tool-text"
                      value={selectedSig.roleLabel}
                      onChange={(e) => updateSig(sel.i, { roleLabel: e.target.value })}
                      placeholder="ตำแหน่ง"
                    />
                    <input
                      type="color"
                      value={selectedSig.color}
                      onChange={(e) => updateSig(sel.i, { color: e.target.value })}
                      title="สีชื่อ/ตำแหน่ง/เส้นเซ็นสด"
                    />
                    <span className="cert-tool-label">ตัวอักษร</span>
                    <button
                      className="btn btn-sm"
                      onClick={() => updateSig(sel.i, { fontSize: clampFont(selectedSig.fontSize - 0.1) })}
                      title="ย่อชื่อผู้ลงนาม"
                    >
                      ก−
                    </button>
                    <input
                      className="cert-tool-num"
                      type="number"
                      step="0.1"
                      value={selectedSig.fontSize}
                      onChange={(e) => updateSig(sel.i, { fontSize: clampFont(Number(e.target.value)) })}
                      title="ขนาดชื่อผู้ลงนาม (ตำแหน่งย่อตามให้เอง)"
                    />
                    <button
                      className="btn btn-sm"
                      onClick={() => updateSig(sel.i, { fontSize: clampFont(selectedSig.fontSize + 0.1) })}
                      title="ขยายชื่อผู้ลงนาม"
                    >
                      ก+
                    </button>
                    {selectedSig.mode === "image" && (
                      <>
                        <span className="cert-tool-label">ขนาดลายเซ็น</span>
                        <button
                          className="btn btn-sm"
                          onClick={() => updateSig(sel.i, { imageScale: clampSigScale(selectedSig.imageScale - 0.1) })}
                          title="ย่อเฉพาะรูปลายเซ็น"
                        >
                          −
                        </button>
                        <input
                          className="cert-tool-num"
                          type="number"
                          step="5"
                          value={Math.round(selectedSig.imageScale * 100)}
                          onChange={(e) => updateSig(sel.i, { imageScale: clampSigScale(Number(e.target.value) / 100) })}
                          title="ขนาดรูปลายเซ็น % (100 = เท่ากรอบเดิม)"
                        />
                        <button
                          className="btn btn-sm"
                          onClick={() => updateSig(sel.i, { imageScale: clampSigScale(selectedSig.imageScale + 0.1) })}
                          title="ขยายเฉพาะรูปลายเซ็น"
                        >
                          +
                        </button>
                      </>
                    )}
                  </>
                )}

                <span className="cert-tool-sep" />
                <button className="btn btn-sm btn-danger" onClick={deleteSelected} disabled={locked}>
                  ลบ
                </button>
              </>
            )}
          </div>

          <div className="cert-fs-body" ref={fsBodyRef}>
            {fitW > 0 && (
              <CertStage
                {...stageCommon}
                w={Math.max(240, fitW * zoom)}
                interactive
                stageRef={stageRef}
                onMeasure={onMeasure}
              />
            )}
          </div>

          <div className="cert-fs-foot">
            ลากตรงกลางเพื่อย้าย · ลากจุดซ้าย/ขวาเพื่อปรับความกว้างกรอบ · ลากจุดมุมขวาล่าง <strong>ขึ้น/ลง</strong> เพื่อย่อ-ขยายตัวอักษร · ปุ่มลูกศรขยับทีละน้อย (กด Shift = ทีละมาก) · Delete = ลบ
            <br />
            กรอบ<strong>เส้นทึบ</strong> = พอดีข้อความ (กว้างเท่าตัวหนังสือ ไม่มีจุดปรับความกว้าง) · กรอบ<strong>เส้นประ</strong> = กว้างคงที่ โดยมีกรอบชมพูบอกว่าตัวหนังสือกินที่จริงแค่ไหน · เปิด “ย่อพอดีกรอบ” ไว้ = ชื่อยาวเกินกรอบจะย่อลงเองจนพอดี ไม่ตัดคำ ไม่ขึ้นบรรทัดใหม่
          </div>
        </div>,
        document.body
      )}

      {sigTune && (
        <SignatureTuner
          src={sigTune.src}
          initial={sigTune.initial}
          onCancel={() => setSigTune(null)}
          onUse={applySigResult}
        />
      )}
    </div>
  );
}

/**
 * กระดาษหนึ่งใบ — ใช้ CertificateCanvas ตัวเดียวกับตอนพิมพ์ แล้ววางกรอบสำหรับลากทับข้างบน
 * (กรอบคำนวณจาก blockRect/sigRect ชุดเดียวกับที่ canvas ใช้วาง ตำแหน่งจึงตรงกันเสมอ)
 */
function CertStage(props: {
  w: number;
  interactive: boolean;
  stageRef?: React.RefObject<HTMLDivElement | null>;
  template: CanvasTemplate;
  data: CertRenderData;
  qrSvg: string;
  orientation: Orientation;
  layout: CertLayout;
  signatures: SigEdit[];
  sel: Target | null;
  guides: { v: boolean; h: boolean };
  textRects: TextRects;
  labelOf: (t: Target) => string;
  onDeselect: () => void;
  onDown: (e: React.PointerEvent, t: Target, mode: DragMode) => void;
  onMeasure?: (m: TextRects) => void;
}) {
  const { w, interactive, orientation } = props;
  const ratio = pageRatio(orientation);
  const maxY = pageMaxY(orientation);
  const px = (v: number) => (w * v) / 100;

  // ref ของตัวเอง (ไว้วัดข้อความ) แล้วส่งต่อให้ผู้เรียกด้วย — ผู้เรียกใช้มันคำนวณระยะลาก
  const elRef = useRef<HTMLDivElement | null>(null);
  const setRef = (el: HTMLDivElement | null) => {
    elRef.current = el;
    if (props.stageRef) props.stageRef.current = el;
  };

  /**
   * วัดกรอบจริงของตัวอักษรทุกบล็อก (span ที่ CertificateCanvas ครอบข้อความไว้)
   * คิดเป็น % ของ "ความกว้าง" กระดาษ เหมือนทุกพิกัดในระบบนี้ ค่าที่ได้จึงใช้ได้ทุกระดับซูม
   * วัดซ้ำอีกรอบตอนฟอนต์โหลดเสร็จ — ฟอนต์ไทยมาทีหลัง ความกว้างข้อความจะขยับ
   */
  const onMeasure = props.onMeasure;
  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;
    let alive = true;
    const measure = () => {
      if (!alive || !elRef.current) return;
      // ย่อข้อความที่ล้นกรอบก่อนวัดเสมอ — ไม่งั้นกรอบชมพู/กรอบพอดีข้อความรายงานความกว้างก่อนย่อ
      // (ทำทั้งภาพย่อและโหมดเต็มจอ ที่เห็นบนจอจึงเป็นของจริงเหมือนตอนพิมพ์)
      fitCertTexts(elRef.current);
      if (!onMeasure) return;
      const sb = elRef.current.getBoundingClientRect();
      if (!sb.width) return;
      const m: TextRects = {};
      elRef.current.querySelectorAll<HTMLElement>("[data-cert-text]").forEach((n) => {
        const id = n.dataset.certText;
        if (!id) return;
        const r = n.getBoundingClientRect();
        m[id] = {
          left: ((r.left - sb.left) / sb.width) * 100,
          top: ((r.top - sb.top) / sb.width) * 100,
          w: (r.width / sb.width) * 100,
          h: (r.height / sb.width) * 100,
        };
      });
      onMeasure(m);
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      alive = false;
    };
  }, [onMeasure, props.w, props.orientation, props.layout, props.data]);

  return (
    <div
      ref={setRef}
      className="cert-stage"
      style={{ width: w, height: w * ratio }}
      // กันเบราว์เซอร์ลากรูปพื้นหลัง/ลากคลุมข้อความแทนเรา — พอซูมจนจอเลื่อนได้
      // การลากคลุมจะสั่งให้จอไหลตามเมาส์ กลายเป็นจอเด้งจนวางของไม่ได้
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        // กดที่เนื้อกระดาษว่าง ๆ = ยกเลิกการเลือก (ตัวกระดาษเป็น canvas ที่ปูเต็มพื้นที่
        // จึงเทียบ currentTarget ตรง ๆ ไม่ได้ ต้องดูว่าโดนกรอบของชิ้นไหนหรือเปล่า)
        if (interactive && !(e.target as HTMLElement).closest(".cert-box")) props.onDeselect();
      }}
    >
      <CertificateCanvas template={props.template} data={props.data} pageWidth={`${w}px`} qrSvg={props.qrSvg} />
      {interactive && (
        <>
          {props.guides.v && <div className="cert-guide" style={{ left: px(50), top: 0, width: 1, height: w * ratio }} />}
          {props.guides.h && <div className="cert-guide" style={{ top: px(maxY / 2), left: 0, height: 1, width: w }} />}
          {props.layout.map((b) => {
            const measured = props.textRects[b.id];
            const fit = isFit(b);
            return (
              <ElementBox
                key={b.id}
                t={{ kind: "block", id: b.id }}
                r={fitRect(b, orientation, measured)}
                // กรอบคงที่: ขีดเส้นบาง ๆ ตรงที่ตัวหนังสือกินจริง จะได้รู้ว่าเหลือที่ว่างอีกเท่าไร
                // และชื่อยาว ๆ ล้นกรอบหรือยัง (เส้นโผล่พ้นกรอบ = โดนตัดตอนพิมพ์)
                textR={!fit ? measured : undefined}
                fixedWidth={!fit}
                w={w}
                active={sameTarget(props.sel, { kind: "block", id: b.id })}
                label={props.labelOf({ kind: "block", id: b.id })}
                onDown={props.onDown}
              />
            );
          })}
          {props.signatures.map((s, i) => (
            <ElementBox
              key={`sig${i}`}
              t={{ kind: "sig", i }}
              r={sigRect(s, orientation)}
              w={w}
              fixedWidth
              active={sameTarget(props.sel, { kind: "sig", i })}
              label={props.labelOf({ kind: "sig", i })}
              onDown={props.onDown}
              sig
            />
          ))}
        </>
      )}
    </div>
  );
}

function ElementBox({
  t,
  r,
  textR,
  w,
  active,
  label,
  sig,
  fixedWidth,
  onDown,
}: {
  t: Target;
  r: Rect;
  /** กรอบของตัวอักษรจริง — วาดเป็นเส้นบางซ้อนในกรอบ (เฉพาะบล็อกที่กรอบกว้างคงที่) */
  textR?: Rect;
  w: number;
  active: boolean;
  label: string;
  sig?: boolean;
  /** false = กรอบพอดีข้อความ → ไม่มีจุดลากปรับความกว้าง (ความกว้างมาจากตัวอักษรล้วน) */
  fixedWidth?: boolean;
  onDown: (e: React.PointerEvent, t: Target, mode: DragMode) => void;
}) {
  const px = (v: number) => (w * v) / 100;
  return (
    <div
      className={`cert-box${active ? " sel" : ""}${sig ? " sig" : ""}${fixedWidth ? "" : " fit"}`}
      style={{ left: px(r.left), top: px(r.top), width: Math.max(8, px(r.w)), height: Math.max(8, px(r.h)) }}
      title={label}
      onPointerDown={(e) => onDown(e, t, "move")}
    >
      {textR && (
        <span
          className="cert-text-extent"
          style={{ left: px(textR.left - r.left), top: px(textR.top - r.top), width: px(textR.w), height: px(textR.h) }}
        />
      )}
      {active && (
        <>
          <span className="cert-box-tag">{label}</span>
          {fixedWidth && (
            <>
              <span className="cert-h l" title="ปรับความกว้าง" onPointerDown={(e) => onDown(e, t, "resize-l")} />
              <span className="cert-h r" title="ปรับความกว้าง" onPointerDown={(e) => onDown(e, t, "resize-r")} />
            </>
          )}
          <span className="cert-h br" title="ลากขึ้น/ลงเพื่อย่อ-ขยายตัวอักษร" onPointerDown={(e) => onDown(e, t, "scale")} />
        </>
      )}
    </div>
  );
}

/**
 * ช่องแก้ "ข้อความผสม" — พิมพ์ข้อความปนกับปุ่มแทรกช่องข้อมูล เช่น "{medal}    {competition_name}"
 * แทรกตรงตำแหน่งเคอร์เซอร์ (ไม่ใช่ต่อท้ายเสมอ) เพราะคนมักวางเคอร์เซอร์ไว้ตรงที่อยากได้แล้วค่อยกด
 * เว้นวรรคที่เคาะเองไม่ถูกยุบตอนวาด จึงใช้ Space รัว ๆ คั่นระหว่างช่องได้เลย
 */
function ComboField({ value, onChange, block }: { value: string; onChange: (v: string) => void; block?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);

  function insert(token: string) {
    const el = ref.current;
    const at = el?.selectionStart ?? value.length;
    const to = el?.selectionEnd ?? at;
    const next = value.slice(0, at) + token + value.slice(to);
    onChange(next);
    // คืนเคอร์เซอร์ไปหลังโทเคนที่เพิ่งแทรก — พิมพ์ต่อได้ทันทีโดยไม่ต้องเอาเมาส์ไปคลิกใหม่
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(at + token.length, at + token.length);
    });
  }

  return (
    <>
      <input
        ref={ref}
        className={block ? undefined : "cert-tool-text"}
        style={block ? { width: "100%" } : { width: 240 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="เช่น {medal}  {competition_name}"
        title="พิมพ์ข้อความได้ตามใจ แล้วแทรกช่องข้อมูลด้วยปุ่มข้าง ๆ"
      />
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) insert(e.target.value);
          e.target.value = "";
        }}
        title="แทรกช่องข้อมูลตรงตำแหน่งเคอร์เซอร์"
      >
        <option value="" disabled>
          + แทรกช่อง…
        </option>
        {COMBO_TOKENS.map((k) => (
          <option key={k} value={`{${k}}`}>
            {BLOCK_LABEL[k]}
          </option>
        ))}
      </select>
    </>
  );
}

/** วัดความกว้างจริงของคอลัมน์แล้วส่งเป็น px ให้กระดาษ — ภาพย่อต้องพอดีคอลัมน์ทุกขนาดจอ */
function AutoWidth({ ratio, children }: { ratio: number; children: (w: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: "100%", height: w ? w * ratio : undefined }}>
      {w > 0 && children(w)}
    </div>
  );
}

const STATUS_TH: Record<string, string> = { draft: "ฉบับร่าง", published: "เผยแพร่แล้ว", locked: "ล็อก" };

function round(n: number) {
  return Math.round(n * 10) / 10;
}
/** ขนาดตัวอักษรที่ยอมรับ — กันพิมพ์ 0 หรือค่าติดลบจนตัวหนังสือหายไปเฉย ๆ */
function clampFont(n: number) {
  return round2(Math.min(MAX_FONT, Math.max(MIN_FONT, Number.isFinite(n) ? n : MIN_FONT)));
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
