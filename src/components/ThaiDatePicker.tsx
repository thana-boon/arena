"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { formatThaiDate } from "@/lib/domain";

const MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

/**
 * ปฏิทินเลือกวันที่แบบไทย (เดือนไทย + ปี พ.ศ.) — ค่าที่เก็บ/ส่งออกเป็น ISO ค.ศ. "YYYY-MM-DD"
 * ใช้แทน <input type="date"> ที่แสดงปี ค.ศ. ทำให้ผู้ใช้กรอกปีผิด
 */
export function ThaiDatePicker({
  value,
  onChange,
  placeholder = "— เลือกวันที่ —",
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [viewY, setViewY] = useState(parsed ? Number(parsed[1]) : today.getFullYear());
  const [viewM, setViewM] = useState(parsed ? Number(parsed[2]) - 1 : today.getMonth()); // 0–11
  const rootRef = useRef<HTMLDivElement | null>(null);

  // ปิดเมื่อคลิกนอกกล่อง / กด Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (disabled) return;
    if (!open && parsed) {
      // เปิดที่เดือนของวันที่ที่เลือกไว้
      setViewY(Number(parsed[1]));
      setViewM(Number(parsed[2]) - 1);
    }
    setOpen((o) => !o);
  }
  function moveMonth(delta: number) {
    const m = viewM + delta;
    setViewY(viewY + Math.floor(m / 12));
    setViewM(((m % 12) + 12) % 12);
  }

  // ช่วงปีในดรอปดาวน์: รอบปีปัจจุบัน ±3 และครอบคลุมปีที่กำลังดู/ปีที่เลือกเสมอ
  const years = new Set<number>();
  for (let y = today.getFullYear() - 3; y <= today.getFullYear() + 3; y++) years.add(y);
  years.add(viewY);
  if (parsed) years.add(Number(parsed[1]));
  const yearList = [...years].sort((a, b) => a - b);

  const firstDow = new Date(viewY, viewM, 1).getDay();
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const isoToday = toIso(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className="tdp" ref={rootRef}>
      <button
        type="button"
        className={`form-input tdp-input${value ? "" : " tdp-empty"}`}
        disabled={disabled}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span>{value ? formatThaiDate(value) : placeholder}</span>
        <Icon name="calendar" size={16} />
      </button>

      {open && (
        <div className="tdp-pop" role="dialog" aria-label="เลือกวันที่">
          <div className="tdp-head">
            <button type="button" className="tdp-nav" onClick={() => moveMonth(-1)} aria-label="เดือนก่อนหน้า">‹</button>
            <select value={viewM} onChange={(e) => setViewM(Number(e.target.value))} aria-label="เดือน">
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select value={viewY} onChange={(e) => setViewY(Number(e.target.value))} aria-label="ปี พ.ศ.">
              {yearList.map((y) => <option key={y} value={y}>{y + 543}</option>)}
            </select>
            <button type="button" className="tdp-nav" onClick={() => moveMonth(1)} aria-label="เดือนถัดไป">›</button>
          </div>

          <div className="tdp-grid tdp-week">
            {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className="tdp-grid">
            {Array.from({ length: firstDow }, (_, i) => <span key={`b${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const iso = toIso(viewY, viewM, i + 1);
              return (
                <button
                  type="button"
                  key={iso}
                  className={`tdp-day${iso === value ? " on" : ""}${iso === isoToday ? " today" : ""}`}
                  onClick={() => { onChange(iso); setOpen(false); }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          <div className="tdp-foot">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { onChange(isoToday); setOpen(false); }}
            >
              วันนี้
            </button>
            {value && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onChange(""); setOpen(false); }}>
                ล้างค่า
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
