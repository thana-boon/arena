import { requireStaff } from "@/lib/auth/guards";
import { getActiveYearWithSettings } from "@/lib/queries";
import { db } from "@/db";
import { events } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { fetchTeacherHomerooms, type TeacherHomeroom } from "@/lib/external/teacher-api";
import { ClassRegistrations } from "@/components/ClassRegistrations";
import { RegWindowNotice } from "@/components/RegWindowNotice";

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
    ? await db
        .select({
          id: events.id,
          name: events.name,
          registrationOpen: events.registrationOpen,
          regStart: events.regStart,
          regEnd: events.regEnd,
        })
        .from(events)
        .where(eq(events.yearId, year.id))
        .orderBy(asc(events.name))
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
      {/* บอกตั้งแต่เปิดหน้า ไม่ต้องกดเข้าไปเลือกรายการก่อนถึงจะรู้ว่าหมดเวลาแล้ว */}
      <RegWindowNotice
        events={eventRows}
        note={isAdmin ? "ผู้ดูแลระบบยังสมัครให้นักเรียนได้ตามปกติ (ระบบบันทึกไว้ใน log)" : undefined}
      />
      <ClassRegistrations
        events={eventRows}
        defaultEventId={setting?.defaultEventId ?? null}
        isAdmin={isAdmin}
        homerooms={homerooms}
      />
    </div>
  );
}
