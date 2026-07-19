import { db } from "@/db";
import { academicYears } from "@/db/schema";
import { desc } from "drizzle-orm";
import { fetchAcademicYears } from "@/lib/external/student-api";
import { YearsManager, type SourceYear } from "./YearsManager";

export const dynamic = "force-dynamic";

export default async function YearsPage() {
  const years = await db.select().from(academicYears).orderBy(desc(academicYears.yearBe));
  const importedSet = new Set(years.map((y) => y.yearBe));

  // ดึงจาก Student API ตั้งแต่ตอน render — ไม่ต้องรอผู้ใช้กดซิงค์
  let source: SourceYear[] | null = null;
  let sourceError: string | null = null;
  try {
    const { years: apiYears } = await fetchAcademicYears();
    source = apiYears.map((y) => ({
      yearBe: y.year_be,
      title: y.title,
      isActiveAtSource: y.is_active === 1,
      imported: importedSet.has(y.year_be),
    }));
  } catch {
    sourceError = "เชื่อมต่อ Student API ไม่ได้ — กด \"โหลดใหม่\" เพื่อลองอีกครั้ง";
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>ปีการศึกษา</h1>
        <div className="subtitle">เปิดใช้งานได้ทีละปี — ปีที่ active คือปีที่ใช้แสดง/รับสมัคร</div>
      </div>
      <YearsManager
        years={years.map((y) => ({ id: y.id, yearBe: y.yearBe, isActive: y.isActive }))}
        initialSource={source}
        initialSourceError={sourceError}
      />
    </div>
  );
}
