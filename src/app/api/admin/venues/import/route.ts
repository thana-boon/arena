import { z } from "zod";
import { db } from "@/db";
import { venues } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { parseCsv } from "@/lib/csv";
import { logAudit } from "@/lib/audit";

const importInput = z.object({ csv: z.string().min(1, "ไฟล์ว่างเปล่า") });

// POST: นำเข้าสถานที่จาก CSV — คอลัมน์: ชื่อสถานที่, อาคาร, หมายเหตุ (แถวแรก = header ถูกข้าม)
// upsert ตามชื่อ: ถ้ามีชื่อนี้อยู่แล้ว → อัปเดตอาคาร/หมายเหตุ, ไม่มี → เพิ่มใหม่
export async function POST(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const { csv } = importInput.parse(await req.json());

    const rows = parseCsv(csv);
    if (rows.length < 2) return fail("ไม่พบข้อมูลใน CSV (ต้องมีแถวหัวตาราง + ข้อมูลอย่างน้อย 1 แถว)");

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const seen = new Set<string>();

    // ข้ามแถวแรก (header)
    for (const cols of rows.slice(1)) {
      const name = (cols[0] ?? "").trim();
      const building = (cols[1] ?? "").trim();
      const note = (cols[2] ?? "").trim();
      // ชื่อว่าง หรือ ซ้ำภายในไฟล์เดียวกัน → ข้าม
      if (!name || seen.has(name)) {
        skipped++;
        continue;
      }
      seen.add(name);

      const existing = await db.select({ id: venues.id }).from(venues).where(eq(venues.name, name)).limit(1);
      if (existing.length) {
        await db.update(venues).set({ building, note }).where(eq(venues.id, existing[0].id));
        updated++;
      } else {
        await db.insert(venues).values({ name, building, note });
        created++;
      }
    }

    await logAudit(s.code, "import_venues", { created, updated, skipped });
    return ok({ created, updated, skipped });
  });
}
