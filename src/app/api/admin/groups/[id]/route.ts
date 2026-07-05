import { z } from "zod";
import { db } from "@/db";
import { subjectGroups, competitions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";

const schema = z.object({ name: z.string().min(1).max(191) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await apiRequireRole("admin");
    const id = Number((await params).id);
    const { name } = schema.parse(await req.json());
    await db.update(subjectGroups).set({ name: name.trim() }).where(eq(subjectGroups.id, id));
    return ok();
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await apiRequireRole("admin");
    const id = Number((await params).id);
    const used = await db.select().from(competitions).where(eq(competitions.subjectGroupId, id)).limit(1);
    if (used.length) return fail("ลบไม่ได้ เพราะมีรายการแข่งขันใช้หมวดวิชานี้อยู่");
    await db.delete(subjectGroups).where(eq(subjectGroups.id, id));
    return ok();
  });
}
