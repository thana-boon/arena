import { notFound } from "next/navigation";
import { db } from "@/db";
import { events, competitions } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getActiveYear } from "@/lib/queries";
import { getEventTemplates, defaultLayout, sampleRenderData } from "@/lib/certificates";
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

  // ตัวอย่างชุดเดียวกับที่ใบทดลองพิมพ์ใช้ — ที่เห็นบนจอกับที่ออกจากเครื่องพิมพ์จะได้ตรงกัน
  const sample = await sampleRenderData(eventId, ev.name, year.yearBe);

  return (
    <CertEditor
      event={{ id: ev.id, name: ev.name, eventDate: ev.eventDate, status: ev.status }}
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
