import { requireAdmin } from "@/lib/auth/guards";
import { PublishBody } from "@/components/competition/PublishBody";

export const dynamic = "force-dynamic";

export default async function AdminPublishBoard() {
  const session = await requireAdmin();
  return <PublishBody session={session} scoreBasePath="/admin/scoring" />;
}
