"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useAlert, useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { CertificateCanvas, type CanvasTemplate } from "@/components/certificate/CertificateCanvas";
import { SignatureTuner } from "@/components/certificate/SignatureTuner";
import { SIG_TUNE_NEW, SIG_TUNE_SAVED, type CompressResult, type SigTune } from "@/lib/imageCompress";
import {
  buildSampleData,
  defaultSampleVariant,
  type CertLayout,
  type CertSignature,
  type Orientation,
} from "@/lib/certificateLayout";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const assetUrl = (id: number | null) => (id == null ? null : `${BASE}/api/admin/certificate-assets/${id}`);

type PresetRow = {
  id: number;
  name: string;
  description: string;
  isDefault: boolean;
  orientation: Orientation;
  backgroundAssetId: number | null;
  layout: CertLayout;
  signatures: CertSignature[];
};

type SigRow = {
  id: number;
  name: string;
  roleLabel: string;
  mode: "image" | "blank";
  assetId: number | null;
  color: string;
  fontSize: number;
  imageScale: number;
};

/**
 * คลังแม่แบบเริ่มต้น + ลายเซ็นที่ใช้บ่อย
 *
 * ภาพตัวอย่างใช้ CertificateCanvas ตัวเดียวกับหน้าออกแบบ/หน้าพิมพ์ ต่างแค่ pageWidth
 * — ที่เห็นในคลังคือใบเดียวกับที่งานใหม่จะได้ ไม่ใช่ภาพจำลองคนละชุด
 */
export function CertPresetsManager({
  presets,
  sigPresets,
  sources,
  yearBe,
  dateText,
}: {
  presets: PresetRow[];
  sigPresets: SigRow[];
  sources: { templateId: number; label: string }[];
  yearBe: number;
  dateText: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const alert = useAlert();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // ใบตัวอย่างกลาง ๆ (ไม่มีรายการจริงให้อ้าง) — ชุดเดียวกับที่หน้าออกแบบใช้ตอนงานยังไม่มีรายการ
  const sample = buildSampleData({
    comps: [],
    eventName: "ชื่องานตัวอย่าง",
    yearBe,
    dateText,
    variant: defaultSampleVariant([], "competition"),
  });

  const canvasOf = (p: PresetRow): CanvasTemplate => ({
    orientation: p.orientation,
    backgroundSrc: assetUrl(p.backgroundAssetId),
    layout: p.layout,
    signatures: p.signatures.map((s, i) => ({
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
  });

  // ===== เก็บแบบจากงานที่เคยทำ =====
  const [srcId, setSrcId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newDefault, setNewDefault] = useState(presets.length === 0);

  async function saveFromEvent() {
    if (!srcId) {
      await alert("เลือกงาน/แบบต้นทางก่อน", { danger: true });
      return;
    }
    if (!newName.trim()) {
      await alert("ตั้งชื่อแม่แบบด้วย", { danger: true });
      return;
    }
    setBusy(true);
    const res = await api.post("/api/admin/cert-presets", {
      name: newName.trim(),
      fromTemplateId: Number(srcId),
      isDefault: newDefault,
    });
    setBusy(false);
    if (!res.ok) {
      await alert(res.error, { title: "บันทึกไม่สำเร็จ", danger: true });
      return;
    }
    setNewName("");
    setSrcId("");
    toast("เก็บเข้าคลังแล้ว");
    router.refresh();
  }

  async function patchPreset(id: number, body: Record<string, unknown>, done?: string) {
    setBusy(true);
    const res = await api.patch(`/api/admin/cert-presets/${id}`, body);
    setBusy(false);
    if (!res.ok) {
      await alert(res.error, { title: "ทำรายการไม่สำเร็จ", danger: true });
      return;
    }
    if (done) toast(done);
    router.refresh();
  }

  async function removePreset(p: PresetRow) {
    const ok = await confirm({
      title: "ลบแม่แบบ",
      message: `ลบ “${p.name}” ออกจากคลัง — งานที่เคยลอกไปแล้วไม่กระทบ ยืนยัน?`,
      confirmText: "ลบ",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const res = await api.del(`/api/admin/cert-presets/${p.id}`);
    setBusy(false);
    if (!res.ok) {
      await alert(res.error, { title: "ลบไม่สำเร็จ", danger: true });
      return;
    }
    router.refresh();
  }

  // ===== ลายเซ็นที่บันทึกไว้ =====
  const [tune, setTune] = useState<{ src: File | string; initial: SigTune; editId: number | null } | null>(null);
  const [draft, setDraft] = useState<{ name: string; roleLabel: string }>({ name: "", roleLabel: "" });

  function pickSigFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setTune({ src: f, initial: SIG_TUNE_NEW, editId: null });
  }

  /** อัปโหลดรูปที่ปรับแล้ว → ได้ asset id ที่ใช้ร่วมกับทุกงานได้ */
  async function uploadSig(c: CompressResult): Promise<number | null> {
    const res = await api.post<{ id: number }>("/api/admin/certificate-assets", {
      kind: "signature",
      name: draft.name || "signature",
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

  async function applyTuned(c: CompressResult) {
    const t = tune;
    if (!t) return;
    setTune(null);
    setBusy(true);
    const assetId = await uploadSig(c);
    if (assetId == null) {
      setBusy(false);
      return;
    }
    const res = t.editId
      ? await api.patch(`/api/admin/signature-presets/${t.editId}`, { assetId, mode: "image" })
      : await api.post("/api/admin/signature-presets", {
          name: draft.name.trim(),
          roleLabel: draft.roleLabel.trim(),
          mode: "image",
          assetId,
        });
    setBusy(false);
    if (!res.ok) {
      await alert(res.error, { title: "บันทึกไม่สำเร็จ", danger: true });
      return;
    }
    setDraft({ name: "", roleLabel: "" });
    router.refresh();
  }

  async function patchSig(id: number, body: Record<string, unknown>) {
    setBusy(true);
    const res = await api.patch(`/api/admin/signature-presets/${id}`, body);
    setBusy(false);
    if (!res.ok) await alert(res.error, { title: "บันทึกไม่สำเร็จ", danger: true });
    else router.refresh();
  }

  async function removeSig(s: SigRow) {
    const ok = await confirm({
      title: "ลบลายเซ็น",
      message: `ลบ “${s.name || "ไม่มีชื่อ"}” ออกจากคลัง — ใบที่ใช้ลายเซ็นนี้ไปแล้วไม่กระทบ ยืนยัน?`,
      confirmText: "ลบ",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const res = await api.del(`/api/admin/signature-presets/${s.id}`);
    setBusy(false);
    if (!res.ok) await alert(res.error, { title: "ลบไม่สำเร็จ", danger: true });
    else router.refresh();
  }

  return (
    <div className="stack">
      {/* เก็บจากงานที่เคยทำ */}
      <div className="card stack">
        <strong>เก็บแบบจากงานที่เคยทำ</strong>
        <div className="subtitle">
          เลือกงานที่ออกแบบใบไว้สวยแล้ว ตั้งชื่อ แล้วกดเก็บ — ระบบคัดลอกดีไซน์ ณ ตอนนั้นเข้าคลัง
          (แก้แบบของงานเดิมทีหลังไม่กระทบของในคลัง)
        </div>
        <div className="form-row">
          <label className="field" style={{ flex: 2 }}>
            <span>งาน / แบบต้นทาง</span>
            <select value={srcId} onChange={(e) => setSrcId(e.target.value)}>
              <option value="">— เลือก —</option>
              {sources.map((s) => (
                <option key={s.templateId} value={s.templateId}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>ชื่อในคลัง</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="เช่น ใบมาตรฐานโรงเรียน"
            />
          </label>
        </div>
        <label className="row" style={{ gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={newDefault} onChange={(e) => setNewDefault(e.target.checked)} />
          <span>ใช้เป็นแบบตั้งต้นของงานที่สร้างใหม่</span>
        </label>
        <button className="btn btn-primary" onClick={saveFromEvent} disabled={busy || !sources.length}>
          <Icon name="download" size={16} /> เก็บเข้าคลัง
        </button>
        {!sources.length && <div className="subtitle">ยังไม่มีงานในปีนี้ให้เก็บแบบ</div>}
      </div>

      {/* คลังแม่แบบ */}
      <h2 className="section-title">แม่แบบในคลัง ({presets.length})</h2>
      {!presets.length ? (
        <div className="empty-state card">
          <Icon name="package" size={44} className="empty-ico" />
          <p>ยังไม่มีแม่แบบในคลัง</p>
          <p className="text-sm">
            เก็บจากงานที่เคยทำด้านบน หรือกด “เก็บแบบนี้ไว้เป็นแม่แบบเริ่มต้น” ในหน้าออกแบบเกียรติบัตร
          </p>
        </div>
      ) : (
        <div className="grid-2 stagger">
          {presets.map((p) => (
            <div key={p.id} className="card stack">
              <div className="row between" style={{ gap: 8, alignItems: "flex-start" }}>
                <div>
                  <strong>{p.name}</strong>
                  {p.description && <div className="subtitle mb-0">{p.description}</div>}
                </div>
                {p.isDefault && <span className="badge badge-gold">ค่าเริ่มต้น</span>}
              </div>

              {/* ภาพตัวอย่าง — กระดาษจริงย่อส่วน ไม่ใช่ภาพจำลอง */}
              <div style={{ overflow: "hidden", borderRadius: 8 }}>
                <CertificateCanvas template={canvasOf(p)} data={sample} pageWidth="320px" />
              </div>

              <label className="field">
                <span>ชื่อ</span>
                <input
                  defaultValue={p.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== p.name) patchPreset(p.id, { name: v }, "เปลี่ยนชื่อแล้ว");
                  }}
                />
              </label>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {!p.isDefault && (
                  <button
                    className="btn btn-sm"
                    onClick={() => patchPreset(p.id, { isDefault: true }, "ตั้งเป็นค่าเริ่มต้นแล้ว")}
                    disabled={busy}
                  >
                    ตั้งเป็นค่าเริ่มต้น
                  </button>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => removePreset(p)} disabled={busy}>
                  ลบ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ลายเซ็นที่บันทึกไว้ */}
      <h2 className="section-title">ลายเซ็นที่บันทึกไว้ ({sigPresets.length})</h2>
      <div className="card stack">
        <div className="subtitle">
          ผู้ที่เซ็นทุกงาน (ผอ./รองฯ) เก็บไว้ที่นี่ครั้งเดียว แล้วหยิบใช้จากหน้าออกแบบได้ทุกงาน ·
          รูปจะผ่านกล่องปรับ (ลบพื้นกระดาษ/เปลี่ยนสีหมึก) ก่อนบันทึกเสมอ
        </div>
        <div className="form-row">
          <label className="field">
            <span>ชื่อ</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="เช่น นายสมชาย ใจดี"
            />
          </label>
          <label className="field">
            <span>ตำแหน่ง</span>
            <input
              value={draft.roleLabel}
              onChange={(e) => setDraft((d) => ({ ...d, roleLabel: e.target.value }))}
              placeholder="เช่น ผู้อำนวยการโรงเรียน"
            />
          </label>
          <label className="btn" style={{ alignSelf: "flex-end", cursor: "pointer" }}>
            <Icon name="plus" size={16} /> เลือกรูปลายเซ็น
            <input type="file" accept="image/*" hidden onChange={pickSigFile} />
          </label>
        </div>
      </div>

      {sigPresets.length > 0 && (
        <div className="grid-2 stagger">
          {sigPresets.map((s) => (
            <div key={s.id} className="card stack">
              <div
                style={{
                  background: "#fff",
                  borderRadius: 8,
                  padding: 8,
                  minHeight: 70,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {s.assetId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assetUrl(s.assetId) ?? ""}
                    alt={s.name}
                    style={{ maxHeight: 70, maxWidth: "100%" }}
                  />
                ) : (
                  <span className="subtitle">ไม่มีรูป (เว้นเส้นเซ็นสด)</span>
                )}
              </div>
              <label className="field">
                <span>ชื่อ</span>
                <input
                  defaultValue={s.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== s.name) patchSig(s.id, { name: v });
                  }}
                />
              </label>
              <label className="field">
                <span>ตำแหน่ง</span>
                <input
                  defaultValue={s.roleLabel}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== s.roleLabel) patchSig(s.id, { roleLabel: v });
                  }}
                />
              </label>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {s.assetId != null && (
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      setTune({ src: assetUrl(s.assetId) ?? "", initial: SIG_TUNE_SAVED, editId: s.id })
                    }
                    disabled={busy}
                    title="ลบพื้นหลัง / เปลี่ยนสีหมึก"
                  >
                    ลบพื้น/เปลี่ยนสี
                  </button>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => removeSig(s)} disabled={busy}>
                  ลบ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tune && (
        <SignatureTuner
          src={tune.src}
          initial={tune.initial}
          onCancel={() => setTune(null)}
          onUse={applyTuned}
        />
      )}
    </div>
  );
}
