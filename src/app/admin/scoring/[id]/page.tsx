import { requireAdmin } from "@/lib/auth/guards";
import { ScoringBody } from "@/components/competition/ScoringBody";

export const dynamic = "force-dynamic";

export default async function AdminScoringDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const id = Number((await params).id);
  return <ScoringBody id={id} session={session} />;
}
