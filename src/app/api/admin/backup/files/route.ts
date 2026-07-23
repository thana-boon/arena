import { dumpDatabase } from "@/lib/backup";
import { listServerBackups, saveServerBackup } from "@/lib/backupFiles";
import { apiRequireRole } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { ok, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET: รายชื่อไฟล์สำรองบนเซิร์ฟเวอร์ — เฉพาะแอดมิน
export async function GET() {
  return handle(async () => {
    await apiRequireRole("admin");
    return ok({ files: await listServerBackups() });
  });
}

// POST: สำรองข้อมูลตอนนี้แล้วบันทึกเป็นไฟล์บนเซิร์ฟเวอร์ — เฉพาะแอดมิน
export async function POST() {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const file = await saveServerBackup(await dumpDatabase());
    await logAudit(s.code, "backup_save_server", { name: file.name, size: file.size });
    return ok({ file });
  });
}
