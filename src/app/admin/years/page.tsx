import { db } from "@/db";
import { academicYears } from "@/db/schema";
import { desc } from "drizzle-orm";
import { YearsManager } from "./YearsManager";

export const dynamic = "force-dynamic";

export default async function YearsPage() {
  const years = await db.select().from(academicYears).orderBy(desc(academicYears.yearBe));
  return (
    <div className="stack">
      <div className="page-header">
        <h1>ปีการศึกษา</h1>
        <div className="subtitle">เปิดใช้งานได้ทีละปี — ปีที่ active คือปีที่ใช้แสดง/รับสมัคร</div>
      </div>
      <YearsManager years={years.map((y) => ({ id: y.id, yearBe: y.yearBe, isActive: y.isActive }))} />
    </div>
  );
}
