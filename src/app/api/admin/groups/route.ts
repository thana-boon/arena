import { z } from "zod";
import { db } from "@/db";
import { subjectGroups, subjectGroupCatalog } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";

// เพิ่มหมวดวิชาให้ปีที่ active โดย "เลือกจากแคตตาล็อกที่ซิงค์จาก Teacher API"
const schema = z.object({ catalogNo: z.number().int() });

export async function POST(req: Request) {
  return handle(async () => {
    await apiRequireRole("admin");
    const { catalogNo } = schema.parse(await req.json());
    const year = await getActiveYear();
    if (!year) return fail("ยังไม่มีปีการศึกษาที่เปิดใช้งาน");

    const cat = await db
      .select()
      .from(subjectGroupCatalog)
      .where(eq(subjectGroupCatalog.groupNo, catalogNo))
      .limit(1);
    if (!cat.length) return fail("ไม่พบหมวดนี้ในแคตตาล็อก กรุณาซิงค์จาก Teacher API ก่อน");

    const dup = await db
      .select()
      .from(subjectGroups)
      .where(and(eq(subjectGroups.yearId, year.id), eq(subjectGroups.catalogNo, catalogNo)))
      .limit(1);
    if (dup.length) return fail("มีหมวดวิชานี้ในปีการศึกษานี้อยู่แล้ว");

    const [res] = await db.insert(subjectGroups).values({
      yearId: year.id,
      catalogNo,
      name: cat[0].name || `หมวด ${catalogNo}`,
      sortOrder: catalogNo,
    });
    return ok({ id: res.insertId });
  });
}
