import { Icon } from "@/components/Icon";
import { db } from "@/db";
import { subjectGroups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPublicResultScope, getPublicCompResult } from "@/lib/results";
import { ResultsBrowser } from "./ResultsBrowser";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const { year, event, medalPct, comps } = await getPublicResultScope();
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
      <ResultsBrowser groups={groups.map((g) => ({ id: g.id, name: g.name }))} competitions={data} />
    </div>
  );
}
