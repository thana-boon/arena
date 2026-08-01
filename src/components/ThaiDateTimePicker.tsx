"use client";
import { ThaiDatePicker } from "@/components/ThaiDatePicker";
import { ThaiTimePicker } from "@/components/ThaiTimePicker";

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

  function setDate(d: string) {
    if (!d) return onChange(""); // ล้างวันที่ = ล้างทั้งค่า
    onChange(`${d}T${time || defaultTime}`);
  }

  return (
    <div className="tdt">
      <div className="tdt-date">
        <ThaiDatePicker value={date} onChange={setDate} placeholder={datePlaceholder} disabled={disabled} />
      </div>
      <ThaiTimePicker
        value={time || defaultTime}
        disabled={disabled || !date}
        onChange={(t) => { if (date) onChange(`${date}T${t}`); }}
      />
    </div>
  );
}
