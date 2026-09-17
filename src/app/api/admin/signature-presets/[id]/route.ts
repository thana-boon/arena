import { ok, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { sigPresetPatchInput } from "@/lib/validation";
import { deleteSignaturePreset, updateSignaturePreset } from "@/lib/certPresets";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const id = Number((await params).id);
    const body = sigPresetPatchInput.parse(await req.json());
    await updateSignaturePreset(id, { ...body, assetId: body.assetId ?? undefined });
    await logAudit(s.code, "save_sig_preset", { id, ...body });
    return ok({ id });
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const id = Number((await params).id);
    await deleteSignaturePreset(id);
    await logAudit(s.code, "delete_sig_preset", { id });
    return ok({ deleted: true });
  });
}
