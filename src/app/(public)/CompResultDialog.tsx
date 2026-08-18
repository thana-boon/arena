"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CompResultTable } from "@/components/CompResultTable";
import { api } from "@/lib/client";
import type { PublicCompResult } from "@/lib/domain";

/**
 * ปุ่ม "ดูผลรายการนี้" ที่หน้าแรก — เปิดกล่องผลทับหน้าเดิม ไม่ต้องโหลดหน้าใหม่แล้วเลื่อนหา
 * ปิดแล้วยังอยู่ตรงหมวดที่ไล่ค้างไว้ · ผลดึงตอนกดครั้งแรกครั้งเดียว แล้วจำไว้ในหน้า
 * (หน้าแรกไม่คำนวณผลของทุกรายการล่วงหน้า — หน้านี้คนเข้าเยอะและไม่มีแคช)
 */
export function CompResultDialog({ compId, compName }: { compId: number; compName: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PublicCompResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await api.get<PublicCompResult>(`/api/results/${compId}`);
    if (res.ok) setData(res.data);
    else setError(res.error);
    setLoading(false);
  }, [compId]);

  function openDialog() {
    setOpen(true);
    if (!data && !loading) void load();
  }

  // เปิดกล่องอยู่ = ล็อกไม่ให้หน้าด้านหลังเลื่อนตาม + Esc ปิด (ทำแบบเดียวกับแผ่นเมนู)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const dialog = (
    <div className="modal-overlay overlay-wide" onClick={() => setOpen(false)}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label={`ผลการแข่งขัน ${compName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h3 className="modal-title">{compName}</h3>
            {data && (
              <div className="text-sm muted">
                ระดับ {data.levels.join(", ") || "-"} · คะแนนเต็ม {data.fullScore}
              </div>
            )}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="modal-close"
            aria-label="ปิด"
            onClick={() => setOpen(false)}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="modal-body">
          {loading && (
            <div className="stack" style={{ gap: "var(--space-2)" }}>
              <div className="skeleton line" style={{ width: "70%" }} />
              <div className="skeleton line" style={{ width: "92%" }} />
              <div className="skeleton line" style={{ width: "48%" }} />
            </div>
          )}
          {!loading && error && (
            <div className="stack" style={{ gap: "var(--space-3)" }}>
              <div className="alert alert-error">{error}</div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
                ลองใหม่
              </button>
            </div>
          )}
          {!loading && !error && data && <CompResultTable comp={data} />}
        </div>

        <div className="modal-actions">
          {/* ยังมีทางไปหน้าผลรวม เผื่อคนอยากก๊อปลิงก์ส่งต่อ (#comp-x ใช้แชร์ได้ กล่องนี้ใช้ไม่ได้) */}
          <Link href={`/results#comp-${compId}`} className="btn btn-ghost btn-sm">
            เปิดในหน้าผลทั้งหมด
          </Link>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>
            ปิด
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm mt-4" onClick={openDialog}>
        ดูผลรายการนี้
      </button>

      {/* ต้องเรนเดอร์ผ่าน portal ไปที่ body — การ์ดในหน้าแรกอยู่ใน .stagger ที่มี animation ของ
          transform ค้างไว้ (fill both) การ์ดจึงกลายเป็น containing block ของ position:fixed
          ถ้าเรนเดอร์อยู่ในการ์ด กล่องจะกว้างได้แค่เท่าการ์ด (~360px) แทนที่จะเต็มจอ */}
      {open && createPortal(dialog, document.body)}
    </>
  );
}
