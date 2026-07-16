import { requireAdmin } from "@/lib/auth/guards";
import { ReportsBody } from "@/components/competition/ReportsBody";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const id = Number((await params).id);
  return <ReportsBody id={id} session={session} basePath="/admin/competitions" />;
}
