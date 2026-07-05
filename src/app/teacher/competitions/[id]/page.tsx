import { requireStaff } from "@/lib/auth/guards";
import { CompetitionDetailBody } from "@/components/competition/CompetitionDetailBody";

export const dynamic = "force-dynamic";

export default async function CompetitionDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  const id = Number((await params).id);
  return (
    <CompetitionDetailBody
      id={id}
      session={session}
      basePath="/teacher/competitions"
      scoreBasePath="/teacher/scoring"
    />
  );
}
