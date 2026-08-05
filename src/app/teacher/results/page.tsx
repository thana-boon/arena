import { requireStaff } from "@/lib/auth/guards";
import { PublishBody } from "@/components/competition/PublishBody";

export const dynamic = "force-dynamic";

export default async function TeacherPublishBoard() {
  const session = await requireStaff();
  return <PublishBody session={session} scoreBasePath="/teacher/scoring" />;
}
