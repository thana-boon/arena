import { db } from "@/db";
import { certificateAssets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { NextResponse } from "next/server";

// GET: ส่งไฟล์รูปจริง (ให้ <img> ในหน้า editor ใช้) — admin เท่านั้น
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await apiRequireRole("admin");
    const id = Number((await params).id);
    const rows = await db
      .select({ mime: certificateAssets.mime, data: certificateAssets.data })
      .from(certificateAssets)
      .where(eq(certificateAssets.id, id))
      .limit(1);
    if (!rows.length) return fail("ไม่พบรูป", 404);
    const buf = Buffer.from(rows[0].data, "base64");
    return new NextResponse(buf, {
      headers: { "content-type": rows[0].mime, "cache-control": "private, max-age=3600" },
    });
  });
}
