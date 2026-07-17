import { db } from "@/db";
import { certificateAssets } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { certAssetInput } from "@/lib/validation";
import { validateImageBase64 } from "@/lib/certificates";
import { logAudit } from "@/lib/audit";

// GET: คลังรูป (พื้นหลัง/ลายเซ็น) — กรองด้วย ?kind=background|signature
export async function GET(req: Request) {
  return handle(async () => {
    await apiRequireRole("admin");
    const kind = new URL(req.url).searchParams.get("kind");
    const rows = await db
      .select({
        id: certificateAssets.id,
        kind: certificateAssets.kind,
        name: certificateAssets.name,
        mime: certificateAssets.mime,
        bytes: certificateAssets.bytes,
        width: certificateAssets.width,
        height: certificateAssets.height,
        createdAt: certificateAssets.createdAt,
      })
      .from(certificateAssets)
      .where(kind ? eq(certificateAssets.kind, kind) : undefined)
      .orderBy(desc(certificateAssets.createdAt));
    return ok({ assets: rows });
  });
}

// POST: อัปโหลดรูป (รับ base64 ที่ย่อ+แปลง WebP มาจาก client แล้ว — เซิร์ฟเวอร์ตรวจ magic bytes + ขนาดซ้ำ)
export async function POST(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const body = certAssetInput.parse(await req.json());

    const check = validateImageBase64(body.data, body.mime);
    if (!check.ok) return fail(check.error);

    const [res] = await db
      .insert(certificateAssets)
      .values({
        kind: body.kind,
        name: body.name.trim(),
        mime: body.mime,
        data: body.data,
        bytes: check.bytes,
        width: body.width,
        height: body.height,
        createdBy: s.code,
      })
      .returning({ id: certificateAssets.id });
    await logAudit(s.code, "upload_cert_asset", { id: res.id, kind: body.kind, bytes: check.bytes });
    return ok({ id: res.id });
  });
}
