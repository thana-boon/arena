import { dumpDatabase, restoreDatabase, type BackupFile } from "@/lib/backup";
import { isValidBackupName, readServerBackup, deleteServerBackup, saveServerBackup } from "@/lib/backupFiles";
import { apiRequireRole, ApiAuthError } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { ok, fail, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ name: string }> };

// GET: ดาวน์โหลดไฟล์สำรองที่เก็บบนเซิร์ฟเวอร์ — เฉพาะแอดมิน
// (ไม่ใช้ handle() เพราะต้องคืนไฟล์ดิบ ไม่ใช่ JSON ของ NextResponse)
export async function GET(_req: Request, { params }: Params) {
  try {
    await apiRequireRole("admin");
    const name = decodeURIComponent((await params).name);
    if (!isValidBackupName(name)) return fail("ชื่อไฟล์สำรองไม่ถูกต้อง", 400);
    const text = await readServerBackup(name);
    return new Response(text, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ApiAuthError) return fail(e.message, e.status);
    return fail("ไม่พบไฟล์สำรองนี้บนเซิร์ฟเวอร์", 404);
  }
}

// POST: กู้คืนข้อมูลจากไฟล์สำรองบนเซิร์ฟเวอร์ (เขียนทับข้อมูลทั้งหมด) — เฉพาะแอดมิน
// ก่อนกู้คืนระบบสำรองข้อมูลปัจจุบันเก็บไว้ให้อัตโนมัติ (ชื่อลงท้าย -before-restore) เผื่อกู้ผิดไฟล์
export async function POST(_req: Request, { params }: Params) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const name = decodeURIComponent((await params).name);
    if (!isValidBackupName(name)) return fail("ชื่อไฟล์สำรองไม่ถูกต้อง", 400);

    let data: BackupFile;
    try {
      data = JSON.parse(await readServerBackup(name)) as BackupFile;
    } catch {
      return fail("อ่านไฟล์สำรองไม่สำเร็จ (ไม่พบไฟล์ หรือรูปแบบ JSON ไม่ถูกต้อง)", 400);
    }

    const safety = await saveServerBackup(await dumpDatabase(), "-before-restore");
    try {
      const summary = await restoreDatabase(data);
      const total = summary.reduce((a, b) => a + b.rows, 0);
      await logAudit(s.code, "backup_restore", { from: name, total, safety: safety.name });
      return ok({ summary, total, safetyFile: safety.name });
    } catch (e) {
      // restore ล้มเหลว = ข้อมูลเดิมยังอยู่ (ทรานแซกชัน rollback) — ลบไฟล์ safety ที่เพิ่งสร้างทิ้ง
      await deleteServerBackup(safety.name).catch(() => {});
      return fail(e instanceof Error ? e.message : "กู้คืนข้อมูลไม่สำเร็จ", 400);
    }
  });
}

// DELETE: ลบไฟล์สำรองบนเซิร์ฟเวอร์ — เฉพาะแอดมิน
export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const s = await apiRequireRole("admin");
    const name = decodeURIComponent((await params).name);
    if (!isValidBackupName(name)) return fail("ชื่อไฟล์สำรองไม่ถูกต้อง", 400);
    try {
      await deleteServerBackup(name);
    } catch {
      return fail("ไม่พบไฟล์สำรองนี้บนเซิร์ฟเวอร์", 404);
    }
    await logAudit(s.code, "backup_delete_server", { name });
    return ok();
  });
}
