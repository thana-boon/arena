import { getActiveYear, getTimeSlots } from "@/lib/queries";
import { TimeSlotsManager } from "./TimeSlotsManager";

export const dynamic = "force-dynamic";

export default async function TimeSlotsPage() {
  const year = await getActiveYear();
  if (!year) return <div className="alert alert-warning">ยังไม่มีปีการศึกษาที่เปิดใช้งาน</div>;
  const slots = await getTimeSlots(year.id);
  return (
    <div className="stack">
      <div className="page-header">
        <h1>ช่วงเวลาแข่งขัน</h1>
        <div className="subtitle">ปีการศึกษา {year.yearBe} · กำหนดช่วงเวลาให้เลือกตอนสร้างรายการแข่งขัน</div>
      </div>
      <TimeSlotsManager
        slots={slots.map((s) => ({ id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime }))}
      />
    </div>
  );
}
