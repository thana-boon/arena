import { requireAdmin } from "@/lib/auth/guards";
import { ScoringBody } from "@/components/competition/ScoringBody";

export const dynamic = "force-dynamic";

export default async function AdminScoringDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const id = Number((await params).id);
  // ฝั่ง admin ไม่มีหน้า /admin/scoring — เข้ามาจากหน้าประกาศผล จึงย้อนกลับไปที่นั่น
  return <ScoringBody id={id} session={session} backHref="/admin/results" />;
}
