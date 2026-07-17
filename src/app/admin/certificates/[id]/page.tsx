import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  events,
  competitions,
  entries,
  entryMembers,
} from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getActiveYear } from "@/lib/queries";
import {
  getEventTemplates,
  defaultLayout,
  type CertRenderData,
} from "@/lib/certificates";
import { CertEditor } from "./CertEditor";

export const dynamic = "force-dynamic";

export default async function CertEventEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const eventId = Number((await params).id);
  const year = await getActiveYear();
  if (!year) notFound();

  const ev = (
    await db.select().from(events).where(eq(events.id, eventId)).limit(1)
  )[0];
  if (!ev || ev.yearId !== year.id) notFound();

  const templates = await getEventTemplates(eventId);
  const main = templates.find((t) => t.medalFilter === "") ?? null;

  // รายการในงานนี้ (source of truth = competitions.event_id)
  const compsInEvent = await db
    .select()
    .from(competitions)
    .where(eq(competitions.eventId, eventId))
    .orderBy(asc(competitions.name));
  const selectedIds = compsInEvent.map((c) => c.id);

  // ตัวอย่างสำหรับ preview: ใช้ "ชื่อที่ยาวที่สุด" จากรายการในงาน เพื่อให้เห็นปัญหาชื่อล้นกรอบ
  let sampleName = "เด็กหญิงตัวอย่าง นามสกุลยาวมากพอสมควร";
  let sampleClass = "ม.3/8";
  let sampleComp = compsInEvent[0]?.name ?? "การแข่งขันตัวอย่าง";
  if (selectedIds.length) {
    const compRows = compsInEvent;
    const entRows = await db
      .select({ id: entries.id, competitionId: entries.competitionId })
      .from(entries)
      .where(and(inArray(entries.competitionId, selectedIds), eq(entries.status, "active")));
    if (entRows.length) {
      const members = await db
        .select()
        .from(entryMembers)
        .where(inArray(entryMembers.entryId, entRows.map((e) => e.id)));
      const longest = members.sort((a, b) => b.nameSnapshot.length - a.nameSnapshot.length)[0];
      if (longest) {
        sampleName = longest.nameSnapshot;
        sampleClass = [longest.classLevelSnapshot, longest.classRoomSnapshot].filter(Boolean).join("/");
        const ent = entRows.find((e) => e.id === longest.entryId);
        const comp = compRows.find((c) => c.id === ent?.competitionId);
        if (comp) sampleComp = comp.name;
      }
    }
  }

  const sample: CertRenderData = {
    studentName: sampleName,
    className: sampleClass,
    teamName: null,
    competitionName: sampleComp,
    eventName: ev.name,
    medal: "gold",
    rank: 1,
    serialNo: `${year.yearBe}/0001`,
    verifyToken: "sample",
    dateText: "",
  };

  return (
    <CertEditor
      event={{
        id: ev.id,
        name: ev.name,
        kind: ev.kind,
        eventDate: ev.eventDate,
        status: ev.status,
        visibleToStudents: ev.visibleToStudents,
        registrationOpen: ev.registrationOpen,
        regStart: ev.regStart ? ev.regStart.toISOString().slice(0, 16) : "",
        regEnd: ev.regEnd ? ev.regEnd.toISOString().slice(0, 16) : "",
      }}
      yearBe={year.yearBe}
      initialLayout={main?.layout ?? defaultLayout()}
      initialOrientation={main?.orientation ?? "landscape"}
      initialBackgroundId={main?.backgroundAssetId ?? null}
      initialSignatures={
        main?.signatures.map((s) => ({
          name: s.name,
          roleLabel: s.roleLabel,
          mode: s.mode,
          assetId: s.assetId,
          x: s.x,
          y: s.y,
          width: s.width,
        })) ?? []
      }
      competitions={compsInEvent.map((c) => ({ id: c.id, name: c.name, type: c.type, isPublished: c.isPublished }))}
      sample={sample}
    />
  );
}
