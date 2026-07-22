import { requireStaff } from "@/lib/auth/guards";
import { getActiveYearWithSettings } from "@/lib/queries";
import { db } from "@/db";
import { events } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { fetchTeacherHomerooms, type TeacherHomeroom } from "@/lib/external/teacher-api";
import { ClassRegistrations } from "@/components/ClassRegistrations";

export const dynamic = "force-dynamic";

export default async function TeacherClassRegistrations() {
  const session = await requireStaff();
  const isAdmin = session.role === "admin";

  // ครูทั่วไป — เห็นเฉพาะห้องที่ตัวเองเป็นครูประจำชั้น (จาก SchoolOS)
  let homerooms: TeacherHomeroom[] = [];
  if (!isAdmin) {
    homerooms = await fetchTeacherHomerooms(session.code).catch(() => []);
  }

  const { year, setting } = await getActiveYearWithSettings();
  const eventRows = year
    ? await db.select({ id: events.id, name: events.name }).from(events).where(eq(events.yearId, year.id)).orderBy(asc(events.name))
    : [];
  return (
    <div className="stack">
      <div className="page-header">
        <h1>การสมัครรายห้อง</h1>
        <div className="subtitle">
          {isAdmin
            ? "เลือกชั้น/ห้อง เพื่อดูการสมัครของนักเรียน และสมัครแทนนักเรียนได้"
            : "ดูการสมัครของนักเรียนห้องประจำชั้นของคุณ และสมัครแทนนักเรียนได้"}
        </div>
      </div>
      <ClassRegistrations
        events={eventRows}
        defaultEventId={setting?.defaultEventId ?? null}
        isAdmin={isAdmin}
        homerooms={homerooms}
      />
    </div>
  );
}
