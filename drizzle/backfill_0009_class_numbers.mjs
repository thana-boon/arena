/**
 * เติม "เลขที่ในห้อง" ย้อนหลังให้ผู้สมัครที่ลงทะเบียนไว้ก่อนระบบจะเก็บเลขที่
 *
 *   node drizzle/backfill_0009_class_numbers.mjs --dry   # ดูก่อนว่าจะเติมกี่คน ไม่แตะฐานข้อมูล
 *   node drizzle/backfill_0009_class_numbers.mjs         # เติมจริง
 *
 * ⚠ ควรรัน "ก่อนขึ้นปีการศึกษาใหม่"
 * enrollments ของ SchoolOS แยกตามปี — พอขึ้นปีใหม่ เด็กที่จบ/ลาออกจะไม่มีแถวของปีใหม่
 * แล้วเลขที่ของคนกลุ่มนั้นจะหาไม่ได้อีกเลย (ของที่เติมไว้แล้วอยู่ถาวร ไม่กระทบ)
 *
 * ต้องรัน apply_0009.mjs (เพิ่มคอลัมน์) ก่อน · ปลอดภัยเมื่อรันซ้ำ (แตะเฉพาะแถวที่ยังว่าง)
 * ใช้ DATABASE_URL / SCHOOLOS_API_BASE / SCHOOLOS_API_KEY จาก .env
 */
import "dotenv/config";
import pkg from "pg";

const { Pool } = pkg;
const dryRun = process.argv.includes("--dry");

const API_BASE = (process.env.SCHOOLOS_API_BASE ?? "http://192.168.200.56:3002").replace(/\/+$/, "");
const API_KEY = process.env.SCHOOLOS_API_KEY ?? "";
const PAGE_SIZE = 200;
const MAX_PAGES = 30; // กันวนไม่รู้จบถ้า API ตอบ total เพี้ยน

/**
 * รายชื่อนักเรียนทุกคน (ไล่ทีละหน้าจนครบ)
 * status=all สำคัญมาก — default ของ SchoolOS คือ studying เท่านั้น
 * ซึ่งจะทำให้คนที่จบ/ลาออกไปแล้วหายไปหมด ทั้งที่นั่นคือกลุ่มที่เราต้องรีบเก็บที่สุด
 */
async function fetchAllStudents() {
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${API_BASE}/api/public/v1/students?status=all&page=${page}&pageSize=${PAGE_SIZE}`;
    const res = await fetch(url, {
      headers: { "X-API-Key": API_KEY, "content-type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`SchoolOS students error: ${res.status} ${await res.text()}`);
    const body = await res.json();
    const data = body.data ?? [];
    out.push(...data);
    if (!data.length || page * PAGE_SIZE >= (body.total ?? 0)) break;
  }
  return out;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const hasCol = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='entry_members' AND column_name='class_number_snapshot'`
  );
  if (!hasCol.rowCount) {
    console.error("❌ ยังไม่มีคอลัมน์ class_number_snapshot — รัน `node drizzle/apply_0009.mjs` ก่อน");
    process.exit(1);
  }

  const { rows: blanks } = await pool.query(
    `SELECT id, student_code, name_snapshot FROM entry_members WHERE class_number_snapshot = ''`
  );
  if (!blanks.length) {
    console.log("✔ ไม่มีแถวที่เลขที่ว่าง — ไม่ต้องเติม");
    process.exit(0);
  }
  console.log(`พบ ${blanks.length} แถวที่ยังไม่มีเลขที่ — กำลังดึงรายชื่อจาก SchoolOS (status=all)...`);

  const students = await fetchAllStudents();
  const numberByCode = new Map(
    students
      .filter((s) => s.classNumber != null && String(s.classNumber).trim() !== "")
      .map((s) => [String(s.studentCode), String(s.classNumber)])
  );
  console.log(`ได้รายชื่อ ${students.length} คน (มีเลขที่ ${numberByCode.size} คน)`);

  let filled = 0;
  const missing = [];
  for (const row of blanks) {
    const classNumber = numberByCode.get(String(row.student_code));
    if (!classNumber) {
      missing.push(`${row.name_snapshot} (${row.student_code})`);
      continue;
    }
    if (!dryRun) {
      // กัน race กับการสมัครที่เกิดระหว่างสคริปต์ทำงาน: เขียนทับเฉพาะแถวที่ยังว่างอยู่จริง
      await pool.query(
        `UPDATE entry_members SET class_number_snapshot = $1 WHERE id = $2 AND class_number_snapshot = ''`,
        [classNumber, row.id]
      );
    }
    filled++;
  }

  console.log(dryRun ? `[dry run] จะเติมได้ ${filled} แถว` : `✅ เติมเลขที่แล้ว ${filled} แถว`);
  if (missing.length) {
    console.log(`⚠ ไม่พบเลขที่ของ ${missing.length} คน (ปล่อยว่างไว้ เอกสารจะขึ้น "-"):`);
    for (const m of missing.slice(0, 20)) console.log(`   · ${m}`);
    if (missing.length > 20) console.log(`   ... และอีก ${missing.length - 20} คน`);
  }
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
