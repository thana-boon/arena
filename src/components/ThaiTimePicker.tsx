"use client";

const pad = (n: number) => String(n).padStart(2, "0");

export const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
// นาทีแบบเลือกง่าย ทีละ 5 นาที + 59 (ไว้ทำ "สิ้นสุดวัน" เช่น 23:59)
export const MINUTES = [...Array.from({ length: 12 }, (_, i) => pad(i * 5)), "59"];

/**
 * เลือกเวลาแบบ 24 ชม. ด้วย dropdown ชั่วโมง:นาที — อ่านง่ายกว่า <input type="time">
 * ที่เบราว์เซอร์ชอบแสดงเป็น AM/PM
 * ค่าที่รับ/ส่งออกเป็น "HH:mm"
 */
export function ThaiTimePicker({
  value,
  onChange,
  disabled = false,
  label = "",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** ใส่เพื่อให้ aria-label แยกกันได้เมื่อมีหลายช่องในหน้าเดียว เช่น "เริ่ม" */
  label?: string;
}) {
  const [hh = "00", mm = "00"] = (value || "").split(":");
  // ถ้าข้อมูลเดิมมีนาทีนอกรายการ (เช่น 12:07) ให้เพิ่มเข้าไปด้วย จะได้ไม่โดนเปลี่ยนค่าเงียบ ๆ
  const minutes = MINUTES.includes(mm) ? MINUTES : [...MINUTES, mm].sort();
  const suffix = label ? ` ${label}` : "";

  return (
    <div className="tdt-time">
      <select
        aria-label={`ชั่วโมง${suffix}`}
        value={hh}
        disabled={disabled}
        onChange={(e) => onChange(`${e.target.value}:${mm}`)}
      >
        {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="tdt-colon">:</span>
      <select
        aria-label={`นาที${suffix}`}
        value={mm}
        disabled={disabled}
        onChange={(e) => onChange(`${hh}:${e.target.value}`)}
      >
        {minutes.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <span className="tdt-unit">น.</span>
    </div>
  );
}
