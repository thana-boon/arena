import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { getSubEvent } from "@/lib/substitutions";
import { SubCompList } from "@/components/substitution/SubCompList";

export const dynamic = "force-dynamic";

export default async function AdminSubstitutionEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const session = await requireAdmin();
  const year = await getActiveYear();
  if (!year) notFound();

  const eventId = Number((await params).eventId);
  const detail = await getSubEvent(session, year.id, eventId);
  if (!detail) notFound();

  return (
    <SubCompList
      eventName={detail.event.name}
      rows={detail.rows}
      basePath={`/admin/substitutions/${eventId}`}
      backHref="/admin/substitutions"
    />
  );
}
