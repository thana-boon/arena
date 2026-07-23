import "server-only";
import { pool } from "@/db";

/**
 * สำรอง/กู้คืนข้อมูลแบบ logical (JSON) ครอบคลุมทุกตารางของแอป
 * - dump: SELECT * ทุกตาราง (node-postgres คืน timestamp เป็น Date → JSON.stringify เป็น ISO string)
 * - restore: ล้างของเดิม → เขียนใหม่ → รีเซ็ต sequence ในทรานแซกชันเดียว (all-or-nothing)
 *   สคีมาไม่มี FK constraint จริง (ความสัมพันธ์เป็น logical) จึงไม่ต้องปิด FK check
 * ใช้ JSON แทน pg_dump เพื่อไม่ต้องพึ่ง binary บนเครื่อง production
 */

// ลำดับตาม dependency (พาเรนต์ก่อน) — insert ตามลำดับนี้, delete แบบย้อนกลับ
const TABLES = [
  "academic_years",
  "settings",
  "subject_group_catalog",
  "subject_groups",
  "admins_local",
  "teacher_roles",
  "time_slots",
  "venues",
  "events",
  "competitions",
  "competition_capacity",
  "competition_venues",
  "criteria",
  "entries",
  "entry_members",
  "scores",
  "audit_log",
  "teacher_cache",
  "certificate_assets",
  "certificate_templates",
  "certificate_signatures",
  "certificate_issues",
  "certificate_counters",
] as const;

// ตารางที่ไม่มีคอลัมน์ serial "id" (ใช้ natural key เป็น PK) → ไม่ต้องรีเซ็ต sequence
const NO_SERIAL_ID = new Set<string>([
  "subject_group_catalog",
  "teacher_roles",
  "teacher_cache",
  "certificate_counters",
]);

// v2: ตารางชุดใหม่หลัง events refactor + competition_venues (ไฟล์ v1 สคีมาไม่ตรงแล้ว restore ไม่ได้)
export const BACKUP_VERSION = 2;
const APP_TAG = "skdw-arena";

/** quote identifier ให้ปลอดภัย (ชื่อตาราง/คอลัมน์) */
const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

export type BackupFile = {
  app: string;
  version: number;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
};

export async function dumpDatabase(): Promise<BackupFile> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const t of TABLES) {
    const { rows } = await pool.query(`SELECT * FROM ${q(t)}`);
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
    throw new Error("ไฟล์สำรองไม่ถูกต้อง (ไม่ใช่ข้อมูลของระบบ Sukhon Arena)");
  if (data.version !== BACKUP_VERSION)
    throw new Error(`เวอร์ชันไฟล์สำรองไม่ตรงกัน (ไฟล์ v${data.version} · ระบบ v${BACKUP_VERSION})`);
  if (!data.tables || typeof data.tables !== "object")
    throw new Error("ไฟล์สำรองไม่มีข้อมูลตาราง");

  const client = await pool.connect();
  const summary: RestoreSummary = [];
  try {
    await client.query("BEGIN");
    // pool ตั้ง statement_timeout 30 วิไว้กัน query ค้าง แต่ restore ตั้งใจให้ทำงานนาน
    // — ขยายเฉพาะ transaction นี้ (SET LOCAL คืนค่าเดิมเองตอน COMMIT/ROLLBACK)
    await client.query("SET LOCAL statement_timeout = '120s'");

    // ล้างข้อมูลเดิม (ย้อนลำดับ dependency)
    for (const t of [...TABLES].reverse()) {
      await client.query(`DELETE FROM ${q(t)}`);
    }
    // เขียนข้อมูลใหม่จากไฟล์สำรอง
    for (const t of TABLES) {
      const rows = data.tables[t] ?? [];
      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const colSql = cols.map(q).join(", ");
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        const values = cols.map((c) => row[c]);
        await client.query(`INSERT INTO ${q(t)} (${colSql}) VALUES (${placeholders})`, values);
      }
      summary.push({ table: t, rows: rows.length });
    }
    // รีเซ็ต sequence ของคอลัมน์ serial id ให้ต่อจาก max(id) เดิม (Postgres ไม่ขยับ sequence เองตอน insert ระบุ id)
    for (const t of TABLES) {
      if (NO_SERIAL_ID.has(t)) continue;
      await client.query(
        `SELECT setval(
           pg_get_serial_sequence($1, 'id'),
           COALESCE((SELECT MAX(id) FROM ${q(t)}), 1),
           (SELECT MAX(id) FROM ${q(t)}) IS NOT NULL
         )`,
        [t]
      );
    }

    await client.query("COMMIT");
    return summary;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
