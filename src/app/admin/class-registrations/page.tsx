import { requireAdmin } from "@/lib/auth/guards";
import { ClassRegistrations } from "@/components/ClassRegistrations";

export const dynamic = "force-dynamic";

export default async function AdminClassRegistrations() {
  await requireAdmin();
  return (
    <div className="stack">
      <div className="page-header">
        <h1>การสมัครรายห้อง</h1>
        <div className="subtitle">เลือกชั้น/ห้อง เพื่อดูว่านักเรียนแต่ละคนสมัครกิจกรรมอะไรไปแล้วบ้าง</div>
      </div>
      <ClassRegistrations />
    </div>
  );
}
