import { requireStaff } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { listCompetitions } from "@/lib/listings";
import { canViewCompetition } from "@/lib/permit";
import { db } from "@/db";
import { certificateEventCompetitions, certificateEvents } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { Icon } from "@/components/Icon";
import { TeacherCertificates } from "./TeacherCertificates";

export const dynamic = "force-dynamic";

export default async function TeacherCertificatesPage() {
  const session = await requireStaff();
  const year = await getActiveYear();
  if (!year) {
    return (
      <div className="empty-state card">
        <Icon name="warning" size={44} className="empty-ico" />
        <p>ยังไม่เปิดปีการศึกษา</p>
      </div>
    );
  }

  const all = await listCompetitions(year.id);
  const viewable = all.filter((c) => canViewCompetition(session, c.createdBy, c.groupCatalogNo));

  // จับคู่ว่ารายการไหนอยู่ในงานเกียรติบัตรที่เผยแพร่แล้ว (published/locked)
  const links = viewable.length
    ? await db
        .select({
          competitionId: certificateEventCompetitions.competitionId,
          eventId: certificateEvents.id,
          eventName: certificateEvents.name,
          status: certificateEvents.status,
        })
        .from(certificateEventCompetitions)
        .innerJoin(certificateEvents, eq(certificateEvents.id, certificateEventCompetitions.eventId))
        .where(inArray(certificateEventCompetitions.competitionId, viewable.map((c) => c.id)))
    : [];
  const linkOf = new Map(links.map((l) => [l.competitionId, l]));

  const rows = viewable.map((c) => {
    const link = linkOf.get(c.id);
    const ready = c.isPublished && link != null && link.status !== "draft";
    let reason = "";
    if (!c.isPublished) reason = "ยังไม่ประกาศผล";
    else if (!link) reason = "ยังไม่ถูกจัดเข้างานเกียรติบัตร";
    else if (link.status === "draft") reason = "ผู้ดูแลยังตั้งค่าไม่เสร็จ";
    return {
      id: c.id,
      name: c.name,
      groupName: c.groupName,
      eventName: link?.eventName ?? null,
      activeEntries: c.activeEntries,
      ready,
      reason,
    };
  });

  return (
    <div className="stack">
      <div className="page-header">
        <h1>ออกเกียรติบัตร</h1>
        <div className="subtitle">
          เลือกรายการแข่งขันเพื่อออกเกียรติบัตรให้ผู้เข้าแข่งขันทุกคน · ระบบจะเปิดแท็บใหม่ให้บันทึกเป็น PDF (Ctrl/⌘+P)
        </div>
      </div>
      <TeacherCertificates rows={rows} />
    </div>
  );
}
