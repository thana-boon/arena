import { requireStaff } from "@/lib/auth/guards";
import { CompetitionEditBody } from "@/components/competition/CompetitionEditBody";

export const dynamic = "force-dynamic";

export default async function EditCompetition({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  const id = Number((await params).id);
  return <CompetitionEditBody id={id} session={session} returnTo="/teacher/competitions" />;
}
