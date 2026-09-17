import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { certPresetPatchInput } from "@/lib/validation";
import { deleteCertPreset, getCertPreset, updateCertPreset } from "@/lib/certPresets";
import { logAudit } from "@/lib/audit";

// PATCH: เปลี่ยนชื่อ/คำอธิบาย หรือย้ายธง "ใช้เป็นค่าเริ่มต้นของงานใหม่" มาที่ตัวนี้
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const id = Number((await params).id);
    const preset = await getCertPreset(id);
    if (!preset) return fail("ไม่พบแม่แบบเริ่มต้นนี้", 404);

    const body = certPresetPatchInput.parse(await req.json());
    await updateCertPreset(id, body);
    await logAudit(s.code, "update_cert_preset", { id, ...body });
    return ok({ id });
  });
}

// DELETE: ลบออกจากคลัง — งานที่เคยลอกไปแล้วไม่กระทบ (ลอกเป็น snapshot ไปตั้งแต่ตอนสร้าง)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const id = Number((await params).id);
    const preset = await getCertPreset(id);
    if (!preset) return fail("ไม่พบแม่แบบเริ่มต้นนี้", 404);

    await deleteCertPreset(id);
    await logAudit(s.code, "delete_cert_preset", { id, name: preset.name });
    return ok({ deleted: true });
  });
}
