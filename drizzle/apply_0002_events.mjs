/**
 * รัน migration 0002_events บน DB (ใช้ DATABASE_URL จาก .env ของเครื่องที่รัน)
 *   node drizzle/apply_0002_events.mjs
 *
 * ทำ: rename certificate_events -> events (+คอลัมน์ใหม่), เพิ่ม competitions.event_id,
 *     ย้าย join table -> event_id, สร้าง "งานเริ่มต้น" ต่อปีให้รายการที่ยังไม่มีงาน,
 *     ก๊อปช่วงรับสมัคร/visible จาก settings, แล้ว drop join table + report_sets
 * ปลอดภัยเมื่อรันซ้ำ: ถ้า migrate ไปแล้วจะข้าม (เช็คคอลัมน์ competitions.event_id)
 * ⚠️ สำรอง DB ก่อนรันเสมอ
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pkg from "pg";
const { Pool } = pkg;

const here = dirname(fileURLToPath(import.meta.url));
const ddl = readFileSync(join(here, "0002_events.sql"), "utf8")
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => /\b(ALTER|CREATE|DROP|UPDATE|INSERT)\b/i.test(s));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
try {
  const already = await c.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='competitions' AND column_name='event_id'`
  );
  if (already.rowCount) {
    console.log("✔ migrate ไปแล้ว (competitions.event_id มีอยู่) — ข้าม");
    process.exit(0);
  }

  await c.query("BEGIN");
  for (const stmt of ddl) {
    await c.query(stmt);
    console.log("ddl:", stmt.replace(/\n/g, " ").slice(0, 60));
  }

  // สร้าง "งานเริ่มต้น" ต่อปี สำหรับรายการที่ยังไม่มีงาน
  const years = (await c.query(`SELECT id, year_be FROM academic_years`)).rows;
  for (const y of years) {
    const orphan = (
      await c.query(`SELECT count(*)::int AS n FROM competitions WHERE year_id=$1 AND event_id IS NULL`, [y.id])
    ).rows[0].n;
    if (orphan === 0) continue;
    const ev = await c.query(
      `INSERT INTO events (year_id, name, kind, status, created_by, visible_to_students, registration_open)
       VALUES ($1, $2, 'competition', 'draft', 'system', true, false) RETURNING id`,
      [y.id, `งานแข่งขันทางวิชาการ ปีการศึกษา ${y.year_be}`]
    );
    await c.query(`UPDATE competitions SET event_id=$1 WHERE year_id=$2 AND event_id IS NULL`, [ev.rows[0].id, y.id]);
    console.log(`default event #${ev.rows[0].id} ปี ${y.year_be} (${orphan} รายการ)`);
  }

  // ก๊อปช่วงรับสมัคร + visible จาก settings เดิม -> ทุกงานของปีนั้น (คงพฤติกรรมเดิม)
  await c.query(`
    UPDATE events e SET
      visible_to_students = true,
      registration_open   = s.registration_open,
      reg_start           = s.reg_start,
      reg_end             = s.reg_end
    FROM settings s WHERE s.year_id = e.year_id
  `);

  await c.query("COMMIT");
  console.log("✅ migrate 0002_events สำเร็จ");
} catch (e) {
  await c.query("ROLLBACK");
  console.error("❌ ล้มเหลว (rollback แล้ว):", e.message);
  process.exit(1);
} finally {
  c.release();
  await pool.end();
}
