import { requireAdmin } from "@/lib/auth/guards";
import { getReportBundles } from "@/lib/reportBundle";
import { getActiveYear } from "@/lib/queries";
import { db } from "@/db";
import { events } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { ReportsByEvent } from "./ReportsByEvent";

export const dynamic = "force-dynamic";

export default async function AdminReportsIndexPage() {
  await requireAdmin();
  const year = await getActiveYear();
  const eventRows = year
    ? await db.select().from(events).where(eq(events.yearId, year.id)).orderBy(asc(events.name))
    : [];
  const { yearBe, bundles } = await getReportBundles();
  return (
    <ReportsByEvent
      yearBe={yearBe}
      events={eventRows.map((e) => ({ id: e.id, name: e.name }))}
      bundles={bundles}
    />
  );
}
