import { requireStaff } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { listCompetitions } from "@/lib/listings";
import { canViewCompetition } from "@/lib/permit";
import { db } from "@/db";
import { competitions, events } from "@/db/schema";
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
          competitionId: competitions.id,
          eventId: events.id,
          eventName: events.name,
          status: events.status,
          kind: events.kind,
        })
        .from(competitions)
        .innerJoin(events, eq(events.id, competitions.eventId))
        .where(inArray(competitions.id, viewable.map((c) => c.id)))
    : [];
  const linkOf = new Map(links.map((l) => [l.competitionId, l]));

  const rows = viewable.map((c) => {
    const link = linkOf.get(c.id);
    const isTraining = link?.kind === "training";
    // อบรม: ออกได้เลยไม่ต้องประกาศผล; แข่งขัน: ต้องประกาศผลก่อน
    const ready = link != null && link.status !== "draft" && (isTraining || c.isPublished);
    let reason = "";
    if (!link) reason = "ยังไม่ถูกจัดเข้างาน";
    else if (link.status === "draft") reason = "ผู้ดูแลยังตั้งค่าไม่เสร็จ";
    else if (!isTraining && !c.isPublished) reason = "ยังไม่ประกาศผล";
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
