import { getActiveYearWithSettings } from "@/lib/queries";
import { db } from "@/db";
import { events, competitions, announcements } from "@/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { competitionEditWindow, substitutionSummary } from "@/lib/domain";
import { SettingsForm } from "./SettingsForm";
import { EventsManager, type EventItem } from "./EventsManager";
import { AnnouncementsManager, type AnnouncementItem } from "./AnnouncementsManager";

export const dynamic = "force-dynamic";

function toLocalInput(d: Date | null): string {
  if (!d) return "";
  const dt = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

const fmtDateTime = (d: Date) =>
  new Date(d).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

export default async function SettingsPage() {
  const { year, setting } = await getActiveYearWithSettings();

  // ประกาศไม่ผูกปีการศึกษา — โหลดก่อน guard เพื่อให้ยังจัดการได้แม้ยังไม่ได้เปิดปี
  const annRows = await db.select().from(announcements).orderBy(desc(announcements.updatedAt));
  const annItems: AnnouncementItem[] = annRows.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    level: a.level,
    audience: a.audience,
    isActive: a.isActive,
    dismissible: a.dismissible,
    createdBy: a.createdBy,
    updatedAt: fmtDateTime(a.updatedAt),
  }));

  const announcementSection = (
    <div>
      <h2 style={{ marginBottom: 8 }}>ประกาศ</h2>
      <div className="subtitle" style={{ marginBottom: 12 }}>
        ข้อความที่เปิดไว้จะขึ้นเป็นแถบบนสุดของทุกหน้า หลังนักเรียน/ครูเข้าสู่ระบบ · ปิดสวิตช์เมื่อไม่ต้องการแสดง
      </div>
      <AnnouncementsManager items={annItems} />
    </div>
  );

  if (!year || !setting) {
    return (
      <div className="stack">
        <div className="page-header">
          <h1>ตั้งค่า</h1>
        </div>
        <div className="alert alert-warning">ยังไม่มีปีการศึกษาที่เปิดใช้งาน โปรดเปิดปีการศึกษาก่อน</div>
        {announcementSection}
      </div>
    );
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
    eventDate: e.eventDate ?? "",
    visibleToStudents: e.visibleToStudents,
    registrationOpen: e.registrationOpen,
    regStart: toLocalInput(e.regStart),
    regEnd: toLocalInput(e.regEnd),
    compEditOpen: e.compEditOpen,
    compEditStart: toLocalInput(e.compEditStart),
    compEditEnd: toLocalInput(e.compEditEnd),
    subOpenIndividual: e.subOpenIndividual,
    subOpenTeam: e.subOpenTeam,
    subStart: toLocalInput(e.subStart),
    subEnd: toLocalInput(e.subEnd),
    // สรุปสถานะ ณ ตอน render ที่เซิร์ฟเวอร์ — คิดฝั่ง client จะได้ค่าคนละอย่างกับ SSR (hydration เพี้ยน)
    compEditReason: competitionEditWindow(e).reason,
    subStatus: substitutionSummary(e),
    competitionCount: countMap.get(e.id) ?? 0,
  }));

  return (
    <div className="stack">
      <div className="page-header">
        <h1>ตั้งค่า</h1>
        <div className="subtitle">ปีการศึกษา {year.yearBe}</div>
      </div>

      {announcementSection}

      <div>
        <h2 style={{ marginBottom: 8 }}>งาน (กิจกรรม/การแข่งขัน)</h2>
        <div className="subtitle" style={{ marginBottom: 12 }}>
          สร้างงาน ตั้งชื่อ/ประเภท/การมองเห็น/ช่วงรับสมัคร/ช่วงที่ครูแก้รายการได้ และเลือก “งานเริ่มต้น” · ออกแบบเกียรติบัตรที่เมนู “งาน / เกียรติบัตร”
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
