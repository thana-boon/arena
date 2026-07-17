import { getActiveYearWithSettings } from "@/lib/queries";
import { db } from "@/db";
import { events, competitions } from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { SettingsForm } from "./SettingsForm";
import { EventsManager, type EventItem } from "./EventsManager";

export const dynamic = "force-dynamic";

function toLocalInput(d: Date | null): string {
  if (!d) return "";
  const dt = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export default async function SettingsPage() {
  const { year, setting } = await getActiveYearWithSettings();
  if (!year || !setting) {
    return <div className="alert alert-warning">ยังไม่มีปีการศึกษาที่เปิดใช้งาน โปรดเปิดปีการศึกษาก่อน</div>;
  }

  const eventRows = await db.select().from(events).where(eq(events.yearId, year.id)).orderBy(asc(events.name));
  const compCounts = await db
    .select({ eventId: competitions.eventId, n: sql<number>`count(*)::int` })
    .from(competitions)
    .where(eq(competitions.yearId, year.id))
    .groupBy(competitions.eventId);
  const countMap = new Map(compCounts.map((r) => [r.eventId, r.n]));

  const eventItems: EventItem[] = eventRows.map((e) => ({
    id: e.id,
    name: e.name,
    kind: e.kind,
    status: e.status,
    visibleToStudents: e.visibleToStudents,
    registrationOpen: e.registrationOpen,
    regStart: toLocalInput(e.regStart),
    regEnd: toLocalInput(e.regEnd),
    competitionCount: countMap.get(e.id) ?? 0,
  }));

  return (
    <div className="stack">
      <div className="page-header">
        <h1>ตั้งค่า</h1>
        <div className="subtitle">ปีการศึกษา {year.yearBe}</div>
      </div>

      <div>
        <h2 style={{ marginBottom: 8 }}>งาน (กิจกรรม/การแข่งขัน)</h2>
        <div className="subtitle" style={{ marginBottom: 12 }}>
          สร้างงาน ตั้งชื่อ/ประเภท/การมองเห็น/ช่วงรับสมัคร และเลือก “งานเริ่มต้น” · ออกแบบเกียรติบัตรที่เมนู “งาน / เกียรติบัตร”
        </div>
        <EventsManager events={eventItems} defaultEventId={setting.defaultEventId ?? null} />
      </div>

      <div>
        <h2 style={{ marginBottom: 8 }}>เกณฑ์ / โควตา</h2>
        <SettingsForm
          initial={{
            maxEntriesPerStudent: setting.maxEntriesPerStudent,
            medalGoldPct: setting.medalGoldPct,
            medalSilverPct: setting.medalSilverPct,
            medalBronzePct: setting.medalBronzePct,
          }}
        />
      </div>
    </div>
  );
}
