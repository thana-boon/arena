import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { certPresetInput } from "@/lib/validation";
import { createCertPreset, listCertPresets, snapshotTemplate } from "@/lib/certPresets";
import { logAudit } from "@/lib/audit";

// GET: คลังแม่แบบเริ่มต้นทั้งหมด (ตัวที่เป็นค่าเริ่มต้นอยู่บนสุด)
export async function GET() {
  return handle(async () => {
    await apiRequireRole("admin");
    return ok({ presets: await listCertPresets() });
  });
}

/**
 * POST: บันทึกแม่แบบเริ่มต้นตัวใหม่
 * ปกติมาจากปุ่ม "บันทึกแบบนี้ไว้ใช้กับงานหน้า" ในหน้าออกแบบ → ส่ง fromTemplateId มา
 * (คัดลอกดีไซน์เป็น snapshot ไม่ผูกกับแม่แบบต้นทาง — ดูเหตุผลใน lib/certPresets.ts)
 */
export async function POST(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const body = certPresetInput.parse(await req.json());

    let design = {
      orientation: body.orientation ?? ("landscape" as const),
      backgroundAssetId: body.backgroundAssetId ?? null,
      layout: body.layout ?? [],
      signatures: (body.signatures ?? []).map((g) => ({
        name: g.name,
        roleLabel: g.roleLabel,
        mode: g.mode,
        assetId: g.assetId ?? null,
        x: g.x,
        y: g.y,
        width: g.width,
        color: g.color,
        fontSize: g.fontSize,
        imageScale: g.imageScale,
      })),
    };
    if (body.fromTemplateId) {
      const src = await snapshotTemplate(body.fromTemplateId);
      if (!src) return fail("ไม่พบแบบต้นทาง", 404);
      design = src;
    }

    const id = await createCertPreset(
      {
        name: body.name.trim(),
        description: body.description,
        isDefault: body.isDefault,
        ...design,
      },
      s.code
    );

    await logAudit(s.code, "save_cert_preset", { id, name: body.name, isDefault: body.isDefault });
    return ok({ id });
  });
}
