import { restoreDatabase, type BackupFile } from "@/lib/backup";
import { apiRequireRole, ApiAuthError } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

// POST: กู้คืนข้อมูลจากไฟล์สำรอง (เขียนทับข้อมูลทั้งหมด) — เฉพาะแอดมิน
export async function POST(req: Request) {
  let code: string;
  try {
    const s = await apiRequireRole("admin");
    code = s.code;
  } catch (e) {
    if (e instanceof ApiAuthError) return fail(e.message, e.status);
    throw e;
  }

  let data: BackupFile;
  try {
    data = (await req.json()) as BackupFile;
  } catch {
    return fail("อ่านไฟล์สำรองไม่สำเร็จ (รูปแบบ JSON ไม่ถูกต้อง)", 400);
  }

  try {
    const summary = await restoreDatabase(data);
    const total = summary.reduce((a, b) => a + b.rows, 0);
    await logAudit(code, "backup_restore", { total });
    return ok({ summary, total });
  } catch (e) {
    console.error("restore error", e);
    return fail(e instanceof Error ? e.message : "กู้คืนข้อมูลไม่สำเร็จ", 400);
  }
}
