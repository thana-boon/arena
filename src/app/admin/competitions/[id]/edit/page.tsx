import { requireAdmin } from "@/lib/auth/guards";
import { CompetitionEditBody } from "@/components/competition/CompetitionEditBody";

export const dynamic = "force-dynamic";

export default async function AdminEditCompetition({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const id = Number((await params).id);
  return <CompetitionEditBody id={id} session={session} returnTo="/admin/competitions" />;
}
