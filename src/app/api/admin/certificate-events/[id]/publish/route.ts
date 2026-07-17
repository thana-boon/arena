import { db } from "@/db";
import { certificateEvents, certificateTemplates } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

const bodyInput = z.object({ action: z.enum(["publish", "unpublish", "unlock"]) });

// POST: เปลี่ยนสถานะงาน
//  publish   draft → published (ครูเริ่ม export ได้) ต้องมีแม่แบบหลักพร้อมพื้นหลังก่อน
//  unpublish published → draft (ยังไม่มีใครออกใบ)
//  unlock    locked → published (ยอมแก้ดีไซน์หลังออกใบไปแล้ว — ผู้ใช้ยืนยันผลกระทบเองที่ฝั่ง UI)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const id = Number((await params).id);
    const { action } = bodyInput.parse(await req.json());
    const rows = await db.select().from(certificateEvents).where(eq(certificateEvents.id, id)).limit(1);
    if (!rows.length) return fail("ไม่พบงาน", 404);
    const ev = rows[0];

    if (action === "publish") {
      if (ev.status === "locked") return fail("งานนี้ออกใบไปแล้ว");
      const main = await db
        .select({ id: certificateTemplates.id, bg: certificateTemplates.backgroundAssetId })
        .from(certificateTemplates)
        .where(and(eq(certificateTemplates.eventId, id), eq(certificateTemplates.medalFilter, "")))
        .limit(1);
      if (!main.length || !main[0].bg)
        return fail("กรุณาตั้งค่าพื้นหลังของแม่แบบก่อนเผยแพร่");
      await db.update(certificateEvents).set({ status: "published" }).where(eq(certificateEvents.id, id));
    } else if (action === "unpublish") {
      if (ev.status === "locked") return fail("งานนี้ออกใบไปแล้ว ยกเลิกเผยแพร่ไม่ได้");
      await db.update(certificateEvents).set({ status: "draft" }).where(eq(certificateEvents.id, id));
    } else {
      // unlock
      await db.update(certificateEvents).set({ status: "published" }).where(eq(certificateEvents.id, id));
    }

    await logAudit(s.code, "cert_event_status", { id, action });
    return ok();
  });
}
