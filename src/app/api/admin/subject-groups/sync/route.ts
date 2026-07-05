import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { syncSubjectGroupCatalog } from "@/lib/subjectGroups";

// POST: ซิงค์รายการหมวด (กลุ่มสาระ) จาก Teacher API ลงแคตตาล็อก
export async function POST() {
  return handle(async () => {
    await apiRequireRole("admin");
    try {
      const catalog = await syncSubjectGroupCatalog();
      return ok({ catalog });
    } catch {
      return fail("เชื่อมต่อ Teacher API ไม่ได้ กรุณาลองใหม่อีกครั้ง", 502);
    }
  });
}
