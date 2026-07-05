import { z } from "zod";
import { db } from "@/db";
import { competitions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";

const schema = z.object({ isPublished: z.boolean() });

// เผยแพร่/ยกเลิกประกาศผล — recorder + admin
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("recorder", "admin");
    const id = Number((await params).id);
    const { isPublished } = schema.parse(await req.json());
    const comp = (await db.select().from(competitions).where(eq(competitions.id, id)).limit(1))[0];
    if (!comp) return fail("ไม่พบรายการแข่งขัน", 404);
    await db.update(competitions).set({ isPublished }).where(eq(competitions.id, id));
    await logAudit(s.code, isPublished ? "publish" : "unpublish", { competitionId: id });
    return ok();
  });
}
