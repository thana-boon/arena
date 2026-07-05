import "server-only";
import { pool } from "@/db";
import type { RowDataPacket, QueryOptions } from "mysql2/promise";

/**
 * สำรอง/กู้คืนข้อมูลแบบ logical (JSON) ครอบคลุมทุกตารางของแอป
 * - dump: SELECT * ทุกตาราง โดยให้ค่า date/datetime เป็น string รูปแบบ MySQL (dateStrings)
 *   เพื่อให้กู้คืนกลับได้ตรงเป๊ะ ไม่เพี้ยน timezone
 * - restore: ปิด FK checks → ล้างของเดิม → เขียนใหม่ ในทรานแซกชันเดียว (all-or-nothing)
 * ใช้ JSON แทน mysqldump เพื่อไม่ต้องพึ่ง binary บนเครื่อง production
 */

// ลำดับตาม dependency (พาเรนต์ก่อน) — insert ตามลำดับนี้, delete แบบย้อนกลับ
const TABLES = [
  "academic_years",
  "settings",
  "subject_group_catalog",
  "subject_groups",
  "admins_local",
  "teacher_roles",
  "competitions",
  "competition_capacity",
  "criteria",
  "entries",
  "entry_members",
  "scores",
  "audit_log",
  "teacher_cache",
] as const;

export const BACKUP_VERSION = 1;
const APP_TAG = "skdw-arena";

export type BackupFile = {
  app: string;
  version: number;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
};

export async function dumpDatabase(): Promise<BackupFile> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const t of TABLES) {
    // dateStrings: คืน date/datetime เป็น string รูปแบบ MySQL (type ของ mysql2 ยังไม่มี field นี้ จึงต้อง cast)
    const opts = { sql: "SELECT * FROM ??", values: [t], dateStrings: true } as unknown as QueryOptions;
    const [rows] = await pool.query<RowDataPacket[]>(opts);
    tables[t] = rows as Record<string, unknown>[];
  }
  return {
    app: APP_TAG,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export type RestoreSummary = { table: string; rows: number }[];

export async function restoreDatabase(data: BackupFile): Promise<RestoreSummary> {
  if (!data || data.app !== APP_TAG)
    throw new Error("ไฟล์สำรองไม่ถูกต้อง (ไม่ใช่ข้อมูลของระบบ SKDW Arena)");
  if (data.version !== BACKUP_VERSION)
    throw new Error(`เวอร์ชันไฟล์สำรองไม่ตรงกัน (ไฟล์ v${data.version} · ระบบ v${BACKUP_VERSION})`);
  if (!data.tables || typeof data.tables !== "object")
    throw new Error("ไฟล์สำรองไม่มีข้อมูลตาราง");

  const conn = await pool.getConnection();
  const summary: RestoreSummary = [];
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.beginTransaction();

    // ล้างข้อมูลเดิม (ย้อนลำดับ dependency)
    for (const t of [...TABLES].reverse()) {
      await conn.query("DELETE FROM ??", [t]);
    }
    // เขียนข้อมูลใหม่จากไฟล์สำรอง
    for (const t of TABLES) {
      const rows = data.tables[t] ?? [];
      for (const row of rows) {
        await conn.query("INSERT INTO ?? SET ?", [t, row]);
      }
      summary.push({ table: t, rows: rows.length });
    }

    await conn.commit();
    return summary;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    await conn.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
    conn.release();
  }
}
