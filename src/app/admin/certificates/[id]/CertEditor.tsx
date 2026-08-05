"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useAlert, useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { CertificateCanvas, type CanvasTemplate } from "@/components/certificate/CertificateCanvas";
import { compressImage, presetFor } from "@/lib/imageCompress";
import {
  BLOCK_KINDS,
  BLOCK_LABEL,
  blockRect,
  pageMaxY,
  pageRatio,
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

type SigEdit = {
  name: string;
  roleLabel: string;
  mode: "image" | "blank";
  assetId: number | null;
  x: number;
  y: number;
  width: number;
};

type CompRow = { id: number; name: string; type: string; isPublished: boolean };

/** สิ่งที่กำลังเลือกอยู่ — บล็อกข้อความ หรือผู้ลงนามลำดับที่ i */
type Target = { kind: "block"; id: string } | { kind: "sig"; i: number };

type DragMode = "move" | "resize-l" | "resize-r" | "scale";

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

  // เต็มจอ = โต๊ะทำงานจริง (ลาก/ย่อขยาย/จัดตำแหน่ง) — ตัวอย่างในหน้าปกติเป็นแค่ภาพย่อไว้กดเข้ามา
  const [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });

  const maxY = pageMaxY(orientation);
  const ratio = pageRatio(orientation);

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
      imageSrc: s.mode === "image" ? assetUrl(s.assetId) : null,
    })),
  };

  const selectedBlock = sel?.kind === "block" ? layout.find((b) => b.id === sel.id) ?? null : null;
  const selectedSig = sel?.kind === "sig" ? signatures[sel.i] ?? null : null;

  // ===== เรขาคณิต: อ่าน/เขียนกรอบของสิ่งที่เลือก =====

  function rectFor(t: Target): Rect | null {
    if (t.kind === "block") {
      const b = layout.find((x) => x.id === t.id);
      return b ? blockRect(b, orientation) : null;
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

      // scale (มุมขวาล่าง): ข้อความให้ตัวอักษรโตตามกรอบ, QR/ลายเซ็นเป็นสี่เหลี่ยมจึงโตตามความกว้างอยู่แล้ว
      const f = Math.max(0.15, (rect0.w + dx) / Math.max(MIN_W, rect0.w));
      const w = Math.max(MIN_W, Math.min(100 - rect0.left, rect0.w * f));
      if (t.kind === "block" && font0 && !isQr) {
        setLayout((L) =>
          L.map((b) => (b.id === t.id ? { ...b, fontSize: round2(Math.max(0.3, font0 * f)) } : b))
        );
      }
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
        ...(kind === "static_text" ? { text: "ข้อความ" } : {}),
      },
    ]);
    setSel({ kind: "block", id });
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

  async function uploadAsset(file: File, kind: "background" | "signature"): Promise<number | null> {
    try {
      const c = await compressImage(file, presetFor(kind));
      const res = await api.post<{ id: number }>("/api/admin/certificate-assets", {
        kind,
        name: file.name,
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

  async function onSigFile(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    const id = await uploadAsset(f, "signature");
    setBusy(false);
    if (id) setSignatures((S) => S.map((s, i) => (i === idx ? { ...s, assetId: id, mode: "image" } : s)));
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
    orientation,
    layout,
    signatures,
    sel,
    guides,
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
                ระบบย่อรูปเป็น WebP กว้างสูงสุด 1754px ให้อัตโนมัติก่อนอัปโหลด
                {!backgroundId && " · ยังไม่มีพื้นหลัง — บันทึกงานค้างไว้ก่อนได้ แต่ต้องใส่ก่อนเผยแพร่"}
              </div>
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
                  {selectedBlock.kind !== "qr" && (
                    <>
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
                      <input type="number" step="0.5" value={selectedBlock.w} onChange={(e) => updateBlock(selectedBlock.id, { w: Number(e.target.value) })} />
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
                  </div>
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
            {fitW > 0 && <CertStage {...stageCommon} w={Math.max(240, fitW * zoom)} interactive stageRef={stageRef} />}
          </div>

          <div className="cert-fs-foot">
            ลากตรงกลางเพื่อย้าย · ลากจุดซ้าย/ขวาเพื่อปรับความกว้าง · ลากจุดมุมขวาล่างเพื่อขยายตัวอักษร · ปุ่มลูกศรขยับทีละน้อย (กด Shift = ทีละมาก) · Delete = ลบ
          </div>
        </div>,
        document.body
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
  orientation: Orientation;
  layout: CertLayout;
  signatures: SigEdit[];
  sel: Target | null;
  guides: { v: boolean; h: boolean };
  labelOf: (t: Target) => string;
  onDeselect: () => void;
  onDown: (e: React.PointerEvent, t: Target, mode: DragMode) => void;
}) {
  const { w, interactive, orientation } = props;
  const ratio = pageRatio(orientation);
  const maxY = pageMaxY(orientation);
  const px = (v: number) => (w * v) / 100;

  return (
    <div
      ref={props.stageRef}
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
      <CertificateCanvas template={props.template} data={props.data} pageWidth={`${w}px`} />
      {interactive && (
        <>
          {props.guides.v && <div className="cert-guide" style={{ left: px(50), top: 0, width: 1, height: w * ratio }} />}
          {props.guides.h && <div className="cert-guide" style={{ top: px(maxY / 2), left: 0, height: 1, width: w }} />}
          {props.layout.map((b) => (
            <ElementBox
              key={b.id}
              t={{ kind: "block", id: b.id }}
              r={blockRect(b, orientation)}
              w={w}
              active={sameTarget(props.sel, { kind: "block", id: b.id })}
              label={props.labelOf({ kind: "block", id: b.id })}
              onDown={props.onDown}
            />
          ))}
          {props.signatures.map((s, i) => (
            <ElementBox
              key={`sig${i}`}
              t={{ kind: "sig", i }}
              r={sigRect(s, orientation)}
              w={w}
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
  w,
  active,
  label,
  sig,
  onDown,
}: {
  t: Target;
  r: Rect;
  w: number;
  active: boolean;
  label: string;
  sig?: boolean;
  onDown: (e: React.PointerEvent, t: Target, mode: DragMode) => void;
}) {
  const px = (v: number) => (w * v) / 100;
  return (
    <div
      className={`cert-box${active ? " sel" : ""}${sig ? " sig" : ""}`}
      style={{ left: px(r.left), top: px(r.top), width: Math.max(8, px(r.w)), height: Math.max(8, px(r.h)) }}
      title={label}
      onPointerDown={(e) => onDown(e, t, "move")}
    >
      {active && (
        <>
          <span className="cert-box-tag">{label}</span>
          <span className="cert-h l" title="ปรับความกว้าง" onPointerDown={(e) => onDown(e, t, "resize-l")} />
          <span className="cert-h r" title="ปรับความกว้าง" onPointerDown={(e) => onDown(e, t, "resize-r")} />
          <span className="cert-h br" title="ขยาย/ย่อทั้งกล่อง" onPointerDown={(e) => onDown(e, t, "scale")} />
        </>
      )}
    </div>
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
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
