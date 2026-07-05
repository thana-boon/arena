import { requireStaff } from "@/lib/auth/guards";
import { ReportsBody } from "@/components/competition/ReportsBody";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  const id = Number((await params).id);
  return <ReportsBody id={id} session={session} />;
}
