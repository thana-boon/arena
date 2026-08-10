import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { getSubCompetition } from "@/lib/substitutions";
import { SubPanel } from "@/components/substitution/SubPanel";

export const dynamic = "force-dynamic";

export default async function TeacherSubstitutionCompPage({
  params,
}: {
  params: Promise<{ eventId: string; compId: string }>;
}) {
  const session = await requireStaff();
  const year = await getActiveYear();
  if (!year) notFound();

  const { eventId, compId } = await params;
  const detail = await getSubCompetition(session, year.id, Number(compId));
  if (!detail) notFound();

  return <SubPanel detail={detail} backHref={`/teacher/substitutions/${eventId}`} />;
}
