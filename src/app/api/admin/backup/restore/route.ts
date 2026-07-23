import { dumpDatabase, restoreDatabase, type BackupFile } from "@/lib/backup";
import { saveServerBackup, deleteServerBackup } from "@/lib/backupFiles";
import { apiRequireRole, ApiAuthError } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

// เพดานขนาดไฟล์สำรอง — req.json() อ่านทั้งก้อนเข้า memory ถ้าไม่จำกัด ไฟล์ใหญ่ ๆ
// จะดัน process ทะลุเพดาน memory (PM2 ตั้ง max_memory_restart 512M) แล้ว restart กลางคัน
const MAX_RESTORE_BYTES = 100 * 1024 * 1024; // 100MB

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

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_RESTORE_BYTES) {
    return fail("ไฟล์สำรองใหญ่เกินไป (เกิน 100MB) กรุณาติดต่อผู้ดูแลระบบเพื่อกู้คืนที่เครื่องเซิร์ฟเวอร์", 413);
  }

  let data: BackupFile;
  try {
    data = (await req.json()) as BackupFile;
  } catch {
    return fail("อ่านไฟล์สำรองไม่สำเร็จ (รูปแบบ JSON ไม่ถูกต้อง)", 400);
  }

  // ก่อนกู้คืนสำรองข้อมูลปัจจุบันเก็บไว้บนเซิร์ฟเวอร์อัตโนมัติ (ลงท้าย -before-restore) เผื่อกู้ผิดไฟล์
  const safety = await saveServerBackup(await dumpDatabase(), "-before-restore");
  try {
    const summary = await restoreDatabase(data);
    const total = summary.reduce((a, b) => a + b.rows, 0);
    await logAudit(code, "backup_restore", { total, safety: safety.name });
    return ok({ summary, total, safetyFile: safety.name });
  } catch (e) {
    // restore ล้มเหลว = ข้อมูลเดิมยังอยู่ (ทรานแซกชัน rollback) — ลบไฟล์ safety ที่เพิ่งสร้างทิ้ง
    await deleteServerBackup(safety.name).catch(() => {});
    console.error("restore error", e);
    return fail(e instanceof Error ? e.message : "กู้คืนข้อมูลไม่สำเร็จ", 400);
  }
}
