"use client";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { PublicEventOption } from "@/lib/results";
import { formatThaiDate } from "@/lib/domain";

/**
 * ตัวกรอง "ดูผลของงานไหน" ที่หน้าสาธารณะ
 *
 * ผูกกับ ?event= ใน URL ไม่ใช่ state ในหน่วยความจำ — คนส่งลิงก์ผลของงานปีที่แล้วต่อกันได้
 * และหน้าเป็น server component อยู่แล้ว (ข้อมูลผลคำนวณฝั่ง server) การเปลี่ยนงานจึงคือการโหลดหน้าใหม่
 *
 * งานที่ไม่มีรายการประกาศผลเลยจะไม่ถูกส่งมาที่นี่ (ดู listPublicEvents) — เลือกแล้วต้องมีอะไรให้ดูเสมอ
 */
export function PublicEventFilter({
  events,
  currentEventId,
}: {
  events: PublicEventOption[];
  currentEventId: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // มีงานเดียวก็ไม่ต้องมีตัวกรองให้รก
  if (events.length <= 1) return null;

  // ปีเดียวกันหมด = ไม่ต้องขึ้นปีกำกับ (งานในปีเดียวกันคนละงานอยู่แล้ว)
  const multiYear = new Set(events.map((e) => e.yearBe)).size > 1;

  return (
    <div className="card row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Icon name="calendar" size={18} />
      <span className="subtitle mb-0">เลือกงาน</span>
      <select
        className="form-select"
        style={{ maxWidth: 360 }}
        value={currentEventId ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          router.push(v ? `${pathname}?event=${v}` : pathname);
        }}
      >
        {currentEventId == null && <option value="">— ทุกงานในปีนี้ —</option>}
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {multiYear ? `${ev.yearBe} · ` : ""}
            {ev.name}
            {ev.eventDate ? ` (${formatThaiDate(ev.eventDate)})` : ""}
          </option>
        ))}
      </select>
      <span className="subtitle mb-0">ย้อนดูผลของงานก่อนหน้าได้จากที่นี่</span>
    </div>
  );
}
