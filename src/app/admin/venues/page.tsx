import { getVenues } from "@/lib/queries";
import { VenuesManager } from "./VenuesManager";

export const dynamic = "force-dynamic";

export default async function VenuesPage() {
  const venues = await getVenues();
  return (
    <div className="stack">
      <div className="page-header">
        <h1>สถานที่แข่งขัน</h1>
        <div className="subtitle">ข้อมูลกลาง (master data) ใช้ร่วมทุกปีการศึกษา · เลือกได้ตอนสร้างรายการแข่งขัน</div>
      </div>
      <VenuesManager
        venues={venues.map((v) => ({ id: v.id, name: v.name, building: v.building, note: v.note }))}
      />
    </div>
  );
}
