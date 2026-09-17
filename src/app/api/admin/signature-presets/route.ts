import { ok, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { sigPresetInput } from "@/lib/validation";
import { createSignaturePreset, listSignaturePresets } from "@/lib/certPresets";
import { logAudit } from "@/lib/audit";

// GET: ลายเซ็นที่บันทึกไว้ใช้ซ้ำ (ผอ./รองฯ ที่เซ็นทุกงาน)
export async function GET() {
  return handle(async () => {
    await apiRequireRole("admin");
    return ok({ presets: await listSignaturePresets() });
  });
}

// POST: บันทึกลายเซ็นไว้ใช้ภายหลัง — รูปเป็น asset ที่อัปโหลด/ปรับสีไว้แล้ว ใช้ร่วมกับงานอื่นได้เลย
export async function POST(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const body = sigPresetInput.parse(await req.json());
    const id = await createSignaturePreset(
      {
        name: body.name.trim(),
        roleLabel: body.roleLabel.trim(),
        mode: body.mode,
        assetId: body.assetId ?? null,
        color: body.color,
        fontSize: body.fontSize,
        imageScale: body.imageScale,
      },
      s.code
    );
    await logAudit(s.code, "save_sig_preset", { id, name: body.name, roleLabel: body.roleLabel });
    return ok({ id });
  });
}
