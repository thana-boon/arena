"use client";
import { ThaiDatePicker } from "@/components/ThaiDatePicker";

const pad = (n: number) => String(n).padStart(2, "0");

const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
// นาทีแบบเลือกง่าย ทีละ 5 นาที + 59 (ไว้ทำ "สิ้นสุดวัน" เช่น 23:59)
const MINUTES = [...Array.from({ length: 12 }, (_, i) => pad(i * 5)), "59"];

/** แยกค่า datetime-local "YYYY-MM-DDTHH:mm" เป็นวันที่ + เวลา */
function split(v: string): { date: string; time: string } {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v || "");
  if (!m) return { date: "", time: "" };
  return { date: m[1], time: m[2] ? `${m[2]}:${m[3]}` : "" };
}

/**
 * เลือก วัน+เวลา แบบไทย — ปฏิทิน พ.ศ. (ThaiDatePicker) + ช่องเวลาแบบ 24 ชม.
 * ค่าที่รับ/ส่งออกเป็นสตริงเดียวกับ <input type="datetime-local"> คือ "YYYY-MM-DDTHH:mm"
 */
export function ThaiDateTimePicker({
  value,
  onChange,
  /** เวลาที่เติมให้อัตโนมัติเมื่อเลือกวันที่ครั้งแรก */
  defaultTime = "08:00",
  datePlaceholder = "— เลือกวันที่ —",
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  defaultTime?: string;
  datePlaceholder?: string;
  disabled?: boolean;
}) {
  const { date, time } = split(value);
  const [hh, mm] = (time || defaultTime).split(":");

  function setDate(d: string) {
    if (!d) return onChange(""); // ล้างวันที่ = ล้างทั้งค่า
    onChange(`${d}T${time || defaultTime}`);
  }
  function setTime(h: string, m: string) {
    if (!date) return;
    onChange(`${date}T${h}:${m}`);
  }

  // ถ้าข้อมูลเดิมมีนาทีนอกรายการ (เช่น 12:07) ให้เพิ่มเข้าไปด้วย จะได้ไม่โดนเปลี่ยนค่าเงียบ ๆ
  const minutes = MINUTES.includes(mm) ? MINUTES : [...MINUTES, mm].sort();

  return (
    <div className="tdt">
      <div className="tdt-date">
        <ThaiDatePicker value={date} onChange={setDate} placeholder={datePlaceholder} disabled={disabled} />
      </div>
      <div className="tdt-time">
        <select
          aria-label="ชั่วโมง"
          value={hh}
          disabled={disabled || !date}
          onChange={(e) => setTime(e.target.value, mm)}
        >
          {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <span className="tdt-colon">:</span>
        <select
          aria-label="นาที"
          value={mm}
          disabled={disabled || !date}
          onChange={(e) => setTime(hh, e.target.value)}
        >
          {minutes.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="tdt-unit">น.</span>
      </div>
    </div>
  );
}
