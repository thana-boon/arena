import { dumpDatabase } from "@/lib/backup";
import { apiRequireRole, ApiAuthError } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET: ดาวน์โหลดไฟล์สำรองข้อมูลทั้งระบบ (JSON) — เฉพาะแอดมิน
export async function GET() {
  try {
    const s = await apiRequireRole("admin");
    const data = await dumpDatabase();
    await logAudit(s.code, "backup_export");

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="arena-backup-${stamp}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ApiAuthError) return fail(e.message, e.status);
    console.error("backup export error", e);
    return fail("สำรองข้อมูลไม่สำเร็จ", 500);
  }
}
