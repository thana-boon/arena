import { z } from "zod";
import { db } from "@/db";
import { academicYears, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { fetchAcademicYears } from "@/lib/external/student-api";

// GET: รายการปีการศึกษาจาก Student API + สถานะว่านำเข้าแล้วหรือยัง
export async function GET() {
  return handle(async () => {
    await apiRequireRole("admin");
    try {
      const { current, years } = await fetchAcademicYears();
      const imported = await db.select().from(academicYears);
      const importedSet = new Set(imported.map((y) => y.yearBe));
      return ok({
        currentYearBe: current?.year_be ?? null,
        years: years.map((y) => ({
          yearBe: y.year_be,
          title: y.title,
          isActiveAtSource: y.is_active === 1,
          imported: importedSet.has(y.year_be),
        })),
      });
    } catch {
      return fail("เชื่อมต่อ Student API ไม่ได้ กรุณาลองใหม่อีกครั้ง", 502);
    }
  });
}

// POST: นำเข้าปีการศึกษา — อนุญาตเฉพาะปีที่มีอยู่ใน Student API เท่านั้น (สร้างเองไม่ได้)
const schema = z.object({ yearBe: z.number().int().min(2500).max(2700) });

export async function POST(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const { yearBe } = schema.parse(await req.json());

    let allowed: number[];
    try {
      const { years } = await fetchAcademicYears();
      allowed = years.map((y) => y.year_be);
    } catch {
      return fail("เชื่อมต่อ Student API ไม่ได้ กรุณาลองใหม่อีกครั้ง", 502);
    }
    if (!allowed.includes(yearBe))
      return fail("ปีการศึกษานี้ไม่มีใน Student API — เลือกได้เฉพาะปีที่ซิงค์มาเท่านั้น");

    const existing = await db.select().from(academicYears).where(eq(academicYears.yearBe, yearBe));
    if (existing.length) return fail("มีปีการศึกษานี้อยู่แล้ว");

    const [res] = await db.insert(academicYears).values({ yearBe, isActive: false });
    await db.insert(settings).values({ yearId: res.insertId });
    await logAudit(s.code, "import_year", { yearBe });
    return ok({ id: res.insertId });
  });
}
