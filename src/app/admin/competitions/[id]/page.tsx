import { requireAdmin } from "@/lib/auth/guards";
import { CompetitionDetailBody } from "@/components/competition/CompetitionDetailBody";

export const dynamic = "force-dynamic";

export default async function AdminCompetitionDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const id = Number((await params).id);
  return (
    <CompetitionDetailBody
      id={id}
      session={session}
      basePath="/admin/competitions"
      scoreBasePath="/admin/scoring"
    />
  );
}
