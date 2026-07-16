import { requireStaff } from "@/lib/auth/guards";
import { ScoringBody } from "@/components/competition/ScoringBody";

export const dynamic = "force-dynamic";

export default async function ScoringDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  const id = Number((await params).id);
  return <ScoringBody id={id} session={session} />;
}
