"use client";
import { useState } from "react";
import { VenueUsageBoard, type UsageCompetition, type UsageVenue } from "./VenueUsageBoard";
import { VenuesManager } from "./VenuesManager";

/**
 * หน้าสถานที่แข่งขันมีสองงานคนละจังหวะกัน จึงแยกเป็นแท็บ:
 * "ผังการใช้ห้อง" ใช้ตอนวางตารางแข่ง (ดูบ่อย) มาก่อน — "จัดการสถานที่" เป็น master data ที่ตั้งทีเดียวจบ
 */
export function VenuesWorkspace({
  venues,
  events,
  competitions,
  defaultEventId,
}: {
  venues: UsageVenue[];
  events: { id: number; name: string }[];
  competitions: UsageCompetition[];
  defaultEventId: number | null;
}) {
  const [tab, setTab] = useState<"usage" | "manage">("usage");
  return (
    <div className="stack">
      <div className="seg" role="tablist" aria-label="มุมมองสถานที่แข่งขัน">
        <button
          role="tab"
          aria-selected={tab === "usage"}
          className={`seg-btn${tab === "usage" ? " on" : ""}`}
          onClick={() => setTab("usage")}
        >
          ผังการใช้ห้อง
        </button>
        <button
          role="tab"
          aria-selected={tab === "manage"}
          className={`seg-btn${tab === "manage" ? " on" : ""}`}
          onClick={() => setTab("manage")}
        >
          จัดการสถานที่ ({venues.length})
        </button>
      </div>

      {tab === "usage" ? (
        <VenueUsageBoard
          venues={venues}
          events={events}
          competitions={competitions}
          defaultEventId={defaultEventId}
        />
      ) : (
        <VenuesManager venues={venues} />
      )}
    </div>
  );
}
