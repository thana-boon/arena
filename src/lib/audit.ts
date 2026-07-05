import "server-only";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

/** บันทึก audit log — override admin, ประกาศผล, ลบ entry ฯลฯ */
export async function logAudit(
  who: string,
  action: string,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(auditLog).values({
      who,
      action,
      detail: detail ? JSON.stringify(detail) : null,
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
