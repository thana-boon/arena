"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BG_LEVEL_MAX,
  BG_LEVEL_MIN,
  compressSignature,
  resultDataUri,
  type CompressResult,
  type SigTune,
} from "@/lib/imageCompress";

/**
 * กล่องปรับรูปลายเซ็นก่อนอัปโหลด — ลบพื้นกระดาษ / เปลี่ยนสีหมึก / ตัดขอบว่าง
 *
 * ทุกอย่างประมวลผลฝั่ง client แล้ว "อบ" ลงไฟล์ WebP ที่เก็บจริง ไม่ได้ทำด้วย CSS ตอนแสดงผล
 * เพราะเกียรติบัตรต้องพิมพ์ออกกระดาษ — filter/mask ของ CSS เบราว์เซอร์หลายตัวไม่พิมพ์ให้
 *
 * ภาพตัวอย่างที่เห็นคือไฟล์ผลลัพธ์ตัวจริง (ผ่าน toBlob แล้ว) จึงไม่มีเซอร์ไพรส์ตอนพิมพ์
 */

const SWATCHES: { label: string; value: string | null }[] = [
  { label: "สีเดิม", value: null },
  { label: "ดำ", value: "#111111" },
  { label: "น้ำเงิน", value: "#1d4ed8" },
  { label: "น้ำเงินเข้ม", value: "#16337a" },
];

const BACKDROPS = [
  { key: "grid", label: "ตาราง" },
  { key: "light", label: "พื้นอ่อน" },
  { key: "dark", label: "พื้นเข้ม" },
] as const;
type Backdrop = (typeof BACKDROPS)[number]["key"];

export function SignatureTuner(props: {
  /** ไฟล์ที่เพิ่งเลือก หรือ URL ของรูปที่เก็บไว้แล้ว (ต้อง same-origin) */
  src: File | string;
  initial: SigTune;
  onCancel: () => void;
  onUse: (result: CompressResult) => void;
}) {
  const { src, onCancel, onUse } = props;
  const [tune, setTune] = useState<SigTune>(props.initial);
  const [result, setResult] = useState<CompressResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(true);
  const [backdrop, setBackdrop] = useState<Backdrop>("grid");
  const runRef = useRef(0);

  // ลากสไลเดอร์ทีเดียวยิงหลายรอบ — หน่วงนิดหนึ่งแล้วนับเฉพาะรอบล่าสุด กันผลลัพธ์เก่ามาทับของใหม่
  useEffect(() => {
    const id = ++runRef.current;
    setWorking(true);
    const timer = setTimeout(() => {
      compressSignature(src, tune)
        .then((r) => {
          if (runRef.current !== id) return;
          setResult(r);
          setError(null);
        })
        .catch((e) => {
          if (runRef.current !== id) return;
          setError(e instanceof Error ? e.message : "ประมวลผลรูปไม่สำเร็จ");
        })
        .finally(() => {
          if (runRef.current === id) setWorking(false);
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [src, tune]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const set = (patch: Partial<SigTune>) => setTune((t) => ({ ...t, ...patch }));
  // สไลเดอร์วิ่งกลับทางกับ bgLevel: ลากขวา = ถือว่าพื้นกระดาษมืดได้มากขึ้น = ลบพื้นแรงขึ้น
  const strength = BG_LEVEL_MIN + BG_LEVEL_MAX - tune.bgLevel;

  return createPortal(
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal sig-tune"
        role="dialog"
        aria-modal="true"
        aria-label="ปรับรูปลายเซ็น"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">ปรับรูปลายเซ็น</h3>

        <div className={`sig-tune-preview bd-${backdrop}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {result && <img src={resultDataUri(result)} alt="ตัวอย่างลายเซ็น" />}
          {working && <span className="sig-tune-busy">กำลังประมวลผล…</span>}
        </div>

        <div className="seg sig-tune-bd" role="group" aria-label="พื้นหลังตัวอย่าง">
          {BACKDROPS.map((b) => (
            <button
              key={b.key}
              type="button"
              className={`seg-btn${backdrop === b.key ? " on" : ""}`}
              onClick={() => setBackdrop(b.key)}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="stack" style={{ gap: 12, marginTop: 12 }}>
          <label className="switch-row">
            <span className="switch">
              <input type="checkbox" checked={tune.removeBg} onChange={(e) => set({ removeBg: e.target.checked })} />
              <span className="knob" />
            </span>
            <span>
              <span className="switch-label">ลบพื้นหลัง</span>
              <span className="subtitle">พื้นกระดาษ/พื้นขาวกลายเป็นโปร่งใส เหลือแต่เส้นหมึก</span>
            </span>
          </label>

          <label className="field">
            <span>ความแรงในการลบพื้น</span>
            <input
              type="range"
              min={BG_LEVEL_MIN}
              max={BG_LEVEL_MAX}
              step={2}
              value={strength}
              disabled={!tune.removeBg && !tune.ink}
              onChange={(e) => set({ bgLevel: BG_LEVEL_MIN + BG_LEVEL_MAX - Number(e.target.value) })}
            />
            <span className="subtitle">
              กระดาษเทาหรือมีเงาให้เพิ่มขึ้น · แรงเกินไปเส้นบาง ๆ จะขาดหาย
            </span>
          </label>

          <div className="field">
            <span>สีหมึก</span>
            <div className="sig-tune-inks">
              {SWATCHES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className={`sig-ink${tune.ink === s.value ? " on" : ""}`}
                  onClick={() => set({ ink: s.value })}
                >
                  {s.value && <span className="sig-ink-dot" style={{ background: s.value }} />}
                  {s.label}
                </button>
              ))}
              <input
                type="color"
                value={tune.ink ?? "#1d4ed8"}
                onChange={(e) => set({ ink: e.target.value })}
                title="เลือกสีเอง"
              />
            </div>
          </div>

          <label className="switch-row">
            <span className="switch">
              <input type="checkbox" checked={tune.trim} onChange={(e) => set({ trim: e.target.checked })} />
              <span className="knob" />
            </span>
            <span>
              <span className="switch-label">ตัดขอบว่างรอบลายเซ็น</span>
              <span className="subtitle">ลายเซ็นจะเต็มกรอบ ไม่ลอยเล็ก ๆ อยู่กลางรูป</span>
            </span>
          </label>
        </div>

        {error && (
          <p className="subtitle" style={{ color: "var(--skdw-red, #b91c1c)", marginTop: 8 }}>
            {error}
          </p>
        )}

        <div className="modal-actions" style={{ alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
          <span className="subtitle">
            {result ? `${result.width}×${result.height} px · ${Math.max(1, Math.round(result.bytes / 1024))} KB` : "—"}
          </span>
          <span className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost" onClick={onCancel}>
              ยกเลิก
            </button>
            <button
              className="btn btn-primary"
              disabled={!result || working}
              onClick={() => result && onUse(result)}
            >
              ใช้รูปนี้
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
