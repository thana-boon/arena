import { Icon } from "@/components/Icon";
import { db } from "@/db";
import { subjectGroups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPublicResultScope, getPublicCompResult, listPublicEvents } from "@/lib/results";
import { PublicEventFilter } from "@/components/PublicEventFilter";
import { ResultsBrowser } from "./ResultsBrowser";

export const dynamic = "force-dynamic";

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  // ?event= = ย้อนดูผลของงานก่อนหน้า (ข้ามปีการศึกษาได้ — เกณฑ์เหรียญใช้ของปีนั้น)
  const picked = Number((await searchParams).event);
  const { year, event, medalPct, comps } = await getPublicResultScope({
    eventId: Number.isFinite(picked) && picked > 0 ? picked : undefined,
  });
  const publicEvents = await listPublicEvents();
  if (!year) {
    return (
      <div className="empty-state card">
        <Icon name="chart" size={44} className="empty-ico" />
        <p>ยังไม่เปิดปีการศึกษา</p>
      </div>
    );
  }

  const groups = await db.select().from(subjectGroups).where(eq(subjectGroups.yearId, year.id));
  const data = [];
  for (const c of comps) {
    const r = await getPublicCompResult(c, medalPct);
    if (r) data.push(r);
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>ผลการแข่งขัน</h1>
        <div className="subtitle">
          {event ? `${event.name} · ` : ""}ปีการศึกษา {year.yearBe}
        </div>
      </div>
      <PublicEventFilter events={publicEvents} currentEventId={event?.id ?? null} />
      <ResultsBrowser
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        competitions={data}
        eventName={event?.name ?? null}
        yearBe={year.yearBe}
      />
    </div>
  );
}
