"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { Icon } from "@/components/Icon";
import { CertificateCanvas, type CanvasTemplate } from "@/components/certificate/CertificateCanvas";
import { compressImage, presetFor } from "@/lib/imageCompress";
import {
  BLOCK_KINDS,
  BLOCK_LABEL,
  type BlockKind,
  type CertBlock,
  type CertLayout,
  type CertRenderData,
} from "@/lib/certificateLayout";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const assetUrl = (id: number | null) => (id == null ? null : `${BASE}/api/admin/certificate-assets/${id}`);

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

export function CertEditor(props: {
  event: { id: number; name: string; eventDate: string | null; status: string };
  yearBe: number;
  initialLayout: CertLayout;
  initialOrientation: "landscape" | "portrait";
  initialBackgroundId: number | null;
  initialSignatures: SigEdit[];
  selectedIds: number[];
  selectable: CompRow[];
  sample: CertRenderData;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const eventId = props.event.id;
  const locked = props.event.status === "locked";

  const [status, setStatus] = useState(props.event.status);
  const [orientation, setOrientation] = useState(props.initialOrientation);
  const [backgroundId, setBackgroundId] = useState<number | null>(props.initialBackgroundId);
  const [layout, setLayout] = useState<CertLayout>(props.initialLayout);
  const [signatures, setSignatures] = useState<SigEdit[]>(props.initialSignatures);
  const [selected, setSelected] = useState<Set<number>>(new Set(props.selectedIds));
  const [selBlock, setSelBlock] = useState<string | null>(null);
  const [selSig, setSelSig] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);

  // วัดความกว้าง canvas จริงเพื่อคำนวณ % ↔ px ตอนลาก
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pageW, setPageW] = useState(720);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPageW(el.clientWidth));
    ro.observe(el);
    setPageW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

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

  function flash(type: string, text: string) {
    setMsg({ type, text });
  }

  // ===== ลากบน canvas =====
  const dragRef = useRef<{ type: "block" | "sig"; key: string | number } | null>(null);
  function pctFromEvent(e: React.PointerEvent | PointerEvent) {
    const el = wrapRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
    };
  }
  function onPointerMove(e: PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const p = pctFromEvent(e);
    if (!p) return;
    if (d.type === "block") {
      setLayout((L) => L.map((b) => (b.id === d.key ? { ...b, x: round(p.x), y: round(p.y) } : b)));
    } else {
      setSignatures((S) => S.map((s, i) => (i === d.key ? { ...s, x: round(p.x), y: round(p.y) } : s)));
    }
  }
  function endDrag() {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
  }
  function startDrag(type: "block" | "sig", key: string | number) {
    if (locked) return;
    dragRef.current = { type, key };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
  }

  // ===== แก้ block =====
  function updateBlock(id: string, patch: Partial<CertBlock>) {
    setLayout((L) => L.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function addBlock(kind: BlockKind) {
    const id = `b${Date.now()}`;
    setLayout((L) => [
      ...L,
      { id, kind, x: 50, y: 50, w: kind === "qr" ? 8 : 60, align: "center", fontSize: 2, font: "th-serif", weight: 400, color: "#1f2937", ...(kind === "static_text" ? { text: "ข้อความ" } : {}) },
    ]);
    setSelBlock(id);
    setSelSig(null);
  }
  function removeBlock(id: string) {
    setLayout((L) => L.filter((b) => b.id !== id));
    setSelBlock(null);
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
        flash("error", res.error);
        return null;
      }
      return res.data.id;
    } catch (e) {
      flash("error", e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
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

  // ===== signatures =====
  function addSig() {
    setSignatures((S) => [...S, { name: "", roleLabel: "", mode: "blank", assetId: null, x: 30 + S.length * 20, y: 80, width: 16 }]);
  }
  function updateSig(idx: number, patch: Partial<SigEdit>) {
    setSignatures((S) => S.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function removeSig(idx: number) {
    setSignatures((S) => S.filter((_, i) => i !== idx));
    setSelSig(null);
  }

  // ===== บันทึก =====
  async function saveCompetitions() {
    setBusy(true); setMsg(null);
    const res = await api.put(`/api/admin/certificate-events/${eventId}/competitions`, {
      competitionIds: [...selected],
    });
    setBusy(false);
    if (!res.ok) return flash("error", res.error);
    flash("success", "บันทึกรายการแข่งขันแล้ว");
    router.refresh();
  }

  async function saveTemplate() {
    if (!backgroundId) return flash("error", "กรุณาอัปโหลดพื้นหลังก่อน");
    setBusy(true); setMsg(null);
    const res = await api.put(`/api/admin/certificate-events/${eventId}/template`, {
      medalFilter: "",
      backgroundAssetId: backgroundId,
      orientation,
      layout,
      signatures,
    });
    setBusy(false);
    if (!res.ok) return flash("error", res.error);
    flash("success", "บันทึกแม่แบบแล้ว");
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
    setBusy(true); setMsg(null);
    const res = await api.post(`/api/admin/certificate-events/${eventId}/publish`, { action });
    setBusy(false);
    if (!res.ok) return flash("error", res.error);
    setStatus(action === "publish" ? "published" : action === "unlock" ? "published" : "draft");
    flash("success", "อัปเดตสถานะแล้ว");
    router.refresh();
  }

  const selectedBlock = layout.find((b) => b.id === selBlock) ?? null;

  return (
    <div className="stack">
      <div className="page-header row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>{props.event.name}</h1>
          <div className="subtitle">
            ปีการศึกษา {props.yearBe} · สถานะ: {STATUS_TH[status] ?? status}
          </div>
        </div>
        <a className="btn" href={`${BASE}/admin/certificates`}><Icon name="chart" size={16} /> กลับ</a>
      </div>

      {msg && <div className={`alert alert-${msg.type === "error" ? "error" : "success"}`}>{msg.text}</div>}
      {locked && (
        <div className="alert alert-warning">
          งานนี้ถูกล็อกเพราะออกเกียรติบัตรไปแล้ว — แก้ไขดีไซน์ไม่ได้จนกว่าจะปลดล็อก
        </div>
      )}

      <div className="cert-editor-grid">
        {/* ซ้าย: แผงตั้งค่า */}
        <div className="stack">
          {/* รายการแข่งขัน */}
          <details className="card" open>
            <summary><strong>1. รายการแข่งขันในงานนี้</strong> ({selected.size})</summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="subtitle">รายการที่ถูกจัดเข้างานอื่นแล้วจะไม่แสดงที่นี่</div>
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {props.selectable.length === 0 && <div className="subtitle">ไม่มีรายการแข่งขันให้เลือก</div>}
                {props.selectable.map((c) => (
                  <label key={c.id} className="row" style={{ gap: 8, padding: "4px 0", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={(e) => {
                        setSelected((S) => {
                          const n = new Set(S);
                          e.target.checked ? n.add(c.id) : n.delete(c.id);
                          return n;
                        });
                      }}
                    />
                    <span>{c.name}</span>
                    {!c.isPublished && <span className="badge" style={{ marginInlineStart: "auto" }}>ยังไม่ประกาศผล</span>}
                  </label>
                ))}
              </div>
              <button className="btn btn-primary btn-sm" onClick={saveCompetitions} disabled={busy}>บันทึกรายการ</button>
            </div>
          </details>

          {/* พื้นหลัง */}
          <details className="card" open>
            <summary><strong>2. พื้นหลัง</strong></summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="form-row">
                <label className="field">
                  <span>แนวกระดาษ</span>
                  <select value={orientation} onChange={(e) => setOrientation(e.target.value as "landscape" | "portrait")} disabled={locked}>
                    <option value="landscape">แนวนอน</option>
                    <option value="portrait">แนวตั้ง</option>
                  </select>
                </label>
              </div>
              <label className="btn btn-sm" style={{ display: "inline-flex", cursor: locked ? "not-allowed" : "pointer" }}>
                <Icon name="download" size={16} /> อัปโหลดพื้นหลัง
                <input type="file" accept="image/*" hidden onChange={onBgFile} disabled={locked} />
              </label>
              <div className="subtitle">ระบบย่อรูปเป็น WebP กว้างสูงสุด 1754px ให้อัตโนมัติก่อนอัปโหลด</div>
            </div>
          </details>

          {/* ข้อความ */}
          <details className="card" open>
            <summary><strong>3. ตำแหน่งข้อความ</strong></summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <select id="add-block" defaultValue="" onChange={(e) => { if (e.target.value) { addBlock(e.target.value as BlockKind); e.target.value = ""; } }} disabled={locked}>
                  <option value="" disabled>+ เพิ่มข้อความ…</option>
                  {BLOCK_KINDS.map((k) => <option key={k} value={k}>{BLOCK_LABEL[k]}</option>)}
                </select>
              </div>
              <div className="stack" style={{ gap: 4 }}>
                {layout.map((b) => (
                  <button
                    key={b.id}
                    className={`btn btn-sm ${selBlock === b.id ? "btn-primary" : ""}`}
                    style={{ justifyContent: "flex-start" }}
                    onClick={() => { setSelBlock(b.id); setSelSig(null); }}
                  >
                    {BLOCK_LABEL[b.kind]}{b.kind === "static_text" && b.text ? `: ${b.text}` : ""}
                  </button>
                ))}
              </div>

              {selectedBlock && (
                <div className="card stack" style={{ gap: 8, background: "var(--surface-2, #f8fafc)" }}>
                  <strong>{BLOCK_LABEL[selectedBlock.kind]}</strong>
                  {(selectedBlock.kind === "static_text") && (
                    <label className="field"><span>ข้อความ</span>
                      <input value={selectedBlock.text ?? ""} onChange={(e) => updateBlock(selectedBlock.id, { text: e.target.value })} /></label>
                  )}
                  {selectedBlock.kind !== "qr" && (
                    <>
                      <div className="form-row">
                        <label className="field"><span>ขนาดฟอนต์</span>
                          <input type="number" step="0.1" value={selectedBlock.fontSize} onChange={(e) => updateBlock(selectedBlock.id, { fontSize: Number(e.target.value) })} /></label>
                        <label className="field"><span>น้ำหนัก</span>
                          <select value={selectedBlock.weight} onChange={(e) => updateBlock(selectedBlock.id, { weight: Number(e.target.value) })}>
                            {[300, 400, 500, 600, 700].map((w) => <option key={w} value={w}>{w}</option>)}
                          </select></label>
                      </div>
                      <div className="form-row">
                        <label className="field"><span>จัดวาง</span>
                          <select value={selectedBlock.align} onChange={(e) => updateBlock(selectedBlock.id, { align: e.target.value as CertBlock["align"] })}>
                            <option value="left">ซ้าย</option><option value="center">กลาง</option><option value="right">ขวา</option>
                          </select></label>
                        <label className="field"><span>ฟอนต์</span>
                          <select value={selectedBlock.font} onChange={(e) => updateBlock(selectedBlock.id, { font: e.target.value as CertBlock["font"] })}>
                            <option value="th-serif">มีเชิง</option><option value="th-sans">ไม่มีเชิง</option><option value="th-modern">โมเดิร์น</option>
                          </select></label>
                        <label className="field"><span>สี</span>
                          <input type="color" value={selectedBlock.color} onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })} /></label>
                      </div>
                    </>
                  )}
                  <div className="form-row">
                    <label className="field"><span>X %</span>
                      <input type="number" step="0.5" value={selectedBlock.x} onChange={(e) => updateBlock(selectedBlock.id, { x: Number(e.target.value) })} /></label>
                    <label className="field"><span>Y %</span>
                      <input type="number" step="0.5" value={selectedBlock.y} onChange={(e) => updateBlock(selectedBlock.id, { y: Number(e.target.value) })} /></label>
                    <label className="field"><span>กว้าง %</span>
                      <input type="number" step="0.5" value={selectedBlock.w} onChange={(e) => updateBlock(selectedBlock.id, { w: Number(e.target.value) })} /></label>
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => removeBlock(selectedBlock.id)}>ลบข้อความนี้</button>
                </div>
              )}
            </div>
          </details>

          {/* ลายเซ็น */}
          <details className="card" open>
            <summary><strong>4. ผู้ลงนาม</strong> ({signatures.length})</summary>
            <div className="stack" style={{ marginTop: 12 }}>
              {signatures.map((s, i) => (
                <div key={i} className="card stack" style={{ gap: 8, background: "var(--surface-2, #f8fafc)" }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>ผู้ลงนามคนที่ {i + 1}</strong>
                    <button className="btn btn-sm btn-danger" onClick={() => removeSig(i)}>ลบ</button>
                  </div>
                  <label className="field"><span>ชื่อ</span>
                    <input value={s.name} onChange={(e) => updateSig(i, { name: e.target.value })} placeholder="เช่น นายสมชาย ใจดี" /></label>
                  <label className="field"><span>ตำแหน่ง</span>
                    <input value={s.roleLabel} onChange={(e) => updateSig(i, { roleLabel: e.target.value })} placeholder="เช่น ผู้อำนวยการโรงเรียน" /></label>
                  <div className="form-row">
                    <label className="field"><span>รูปแบบ</span>
                      <select value={s.mode} onChange={(e) => updateSig(i, { mode: e.target.value as "image" | "blank" })}>
                        <option value="blank">เว้นเส้นเซ็นสด</option>
                        <option value="image">ลายเซ็นดิจิทัล (รูป)</option>
                      </select></label>
                    {s.mode === "image" && (
                      <label className="btn btn-sm" style={{ alignSelf: "flex-end", cursor: "pointer" }}>
                        {s.assetId ? "เปลี่ยนรูป" : "อัปโหลด"}
                        <input type="file" accept="image/*" hidden onChange={(e) => onSigFile(i, e)} />
                      </label>
                    )}
                  </div>
                  <div className="form-row">
                    <label className="field"><span>X %</span><input type="number" step="0.5" value={s.x} onChange={(e) => updateSig(i, { x: Number(e.target.value) })} /></label>
                    <label className="field"><span>Y %</span><input type="number" step="0.5" value={s.y} onChange={(e) => updateSig(i, { y: Number(e.target.value) })} /></label>
                    <label className="field"><span>กว้าง %</span><input type="number" step="0.5" value={s.width} onChange={(e) => updateSig(i, { width: Number(e.target.value) })} /></label>
                  </div>
                </div>
              ))}
              {signatures.length < 6 && <button className="btn btn-sm" onClick={addSig} disabled={locked}><Icon name="plus" size={16} /> เพิ่มผู้ลงนาม</button>}
            </div>
          </details>

          {/* บันทึก + เผยแพร่ */}
          <div className="card stack">
            <button className="btn btn-primary" onClick={saveTemplate} disabled={busy || locked}>
              <Icon name="pencil" size={16} /> บันทึกแม่แบบ
            </button>
            {status === "draft" && <button className="btn" onClick={() => changeStatus("publish")} disabled={busy}>เผยแพร่ให้ครูออกได้</button>}
            {status === "published" && <button className="btn" onClick={() => changeStatus("unpublish")} disabled={busy}>ยกเลิกเผยแพร่</button>}
            {status === "locked" && <button className="btn btn-danger" onClick={() => changeStatus("unlock")} disabled={busy}>ปลดล็อกเพื่อแก้ไข</button>}
          </div>
        </div>

        {/* ขวา: preview สด + overlay ลาก */}
        <div className="stack" style={{ position: "sticky", top: 12, alignSelf: "flex-start" }}>
          <div className="subtitle">ตัวอย่าง (ลากจุดสีเพื่อย้ายตำแหน่ง) — ใช้ชื่อที่ยาวที่สุดจากรายการที่เลือก</div>
          <div ref={wrapRef} style={{ position: "relative", width: "100%", border: "1px solid var(--border, #e5e7eb)" }}>
            <CertificateCanvas template={canvasTemplate} data={props.sample} pageWidth={`${pageW}px`} />
            {/* overlay จุดลาก */}
            {!locked && layout.map((b) => (
              <Handle key={b.id} x={b.x} y={b.y} active={selBlock === b.id}
                onDown={() => { setSelBlock(b.id); setSelSig(null); startDrag("block", b.id); }} />
            ))}
            {!locked && signatures.map((s, i) => (
              <Handle key={`sig${i}`} x={s.x} y={s.y} active={selSig === i} color="#7c3aed"
                onDown={() => { setSelSig(i); setSelBlock(null); startDrag("sig", i); }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_TH: Record<string, string> = { draft: "ฉบับร่าง", published: "เผยแพร่แล้ว", locked: "ล็อก" };

function round(n: number) {
  return Math.round(n * 10) / 10;
}

function Handle({ x, y, active, color = "#2563eb", onDown }: { x: number; y: number; active: boolean; color?: string; onDown: () => void }) {
  return (
    <div
      onPointerDown={(e) => { e.preventDefault(); onDown(); }}
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: 14,
        height: 14,
        marginLeft: -7,
        marginTop: -7,
        borderRadius: "50%",
        background: color,
        border: "2px solid #fff",
        boxShadow: active ? `0 0 0 3px ${color}55` : "0 1px 3px rgba(0,0,0,.4)",
        cursor: "grab",
        touchAction: "none",
        zIndex: 5,
      }}
    />
  );
}
