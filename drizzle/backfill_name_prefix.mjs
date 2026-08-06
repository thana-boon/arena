/**
 * เติม "คำนำหน้าชื่อ" ย้อนหลังให้ผู้สมัครที่ลงทะเบียนไว้ก่อนระบบจะเก็บคำนำหน้า
 *
 *   node drizzle/backfill_name_prefix.mjs --dry   # ดูก่อนว่าจะเติมกี่คน ไม่แตะฐานข้อมูล
 *   node drizzle/backfill_name_prefix.mjs         # เติมจริง
 *
 * ไม่มีคอลัมน์ใหม่ — คำนำหน้าอยู่ใน name_snapshot เลย ("เด็กหญิงสมหญิง ใจดี")
 * เอกสารทุกใบอ่านจากคอลัมน์นี้อยู่แล้ว จึงได้คำนำหน้าพร้อมกันทั้งเกียรติบัตร/ใบรายชื่อ/ใบกรอกคะแนน
 *
 * ⚠ ควรรัน "ก่อนขึ้นปีการศึกษาใหม่" ด้วยเหตุผลเดียวกับเลขที่ในห้อง
 * enrollments ของ SchoolOS แยกตามปี — เด็กที่จบ/ลาออกจะไม่มีแถวของปีใหม่ให้ถามอีก
 *
 * ปลอดภัยเมื่อรันซ้ำ: แตะเฉพาะแถวที่ชื่อตรงกับ "ชื่อ นามสกุล" เปล่า ๆ ของนักเรียนคนนั้นเป๊ะ
 * แถวที่มีคำนำหน้าอยู่แล้ว หรือชื่อถูกแก้จนไม่ตรง จะถูกข้ามและรายงานท้ายสคริปต์
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

/** รายชื่อนักเรียนทุกคน — status=all เพื่อให้ได้คนที่จบ/ลาออกไปแล้วด้วย (กลุ่มที่ต้องรีบเก็บที่สุด) */
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
  const { rows } = await pool.query(`SELECT id, student_code, name_snapshot FROM entry_members`);
  if (!rows.length) {
    console.log("✔ ยังไม่มีผู้สมัครในระบบ — ไม่ต้องเติม");
    process.exit(0);
  }
  console.log(`มีผู้สมัคร ${rows.length} แถว — กำลังดึงรายชื่อจาก SchoolOS (status=all)...`);

  const students = await fetchAllStudents();
  const byCode = new Map(students.map((s) => [String(s.studentCode), s]));
  const withPrefix = students.filter((s) => (s.prefix ?? "").trim()).length;
  console.log(`ได้รายชื่อ ${students.length} คน (มีคำนำหน้า ${withPrefix} คน)`);

  let filled = 0;
  let already = 0;
  const missing = [];
  const mismatched = [];
  for (const row of rows) {
    const s = byCode.get(String(row.student_code));
    const prefix = (s?.prefix ?? "").trim();
    if (!s || !prefix) {
      missing.push(`${row.name_snapshot} (${row.student_code})`);
      continue;
    }
    const plain = `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim();
    const stored = (row.name_snapshot ?? "").trim();
    if (stored === `${prefix}${plain}`) {
      already++;
      continue;
    }
    if (stored !== plain) {
      // ชื่อที่เก็บไว้ไม่ใช่ "ชื่อ นามสกุล" เปล่า ๆ ของคนนี้ — อาจมีคำนำหน้าแบบอื่น หรือถูกแก้ไว้
      // ไม่เดาแทน เพราะ snapshot คือหลักฐานว่าตอนนั้นเอกสารพิมพ์ชื่ออะไร
      mismatched.push(`${stored} → คาดว่า "${plain}" (${row.student_code})`);
      continue;
    }
    if (!dryRun) {
      // กัน race กับการแก้ไขที่เกิดระหว่างสคริปต์ทำงาน: เขียนทับเฉพาะแถวที่ยังเป็นชื่อเดิมจริง
      await pool.query(`UPDATE entry_members SET name_snapshot = $1 WHERE id = $2 AND name_snapshot = $3`, [
        `${prefix}${plain}`,
        row.id,
        row.name_snapshot,
      ]);
    }
    filled++;
  }

  console.log(dryRun ? `[dry run] จะเติมได้ ${filled} แถว` : `✅ เติมคำนำหน้าแล้ว ${filled} แถว`);
  if (already) console.log(`· มีคำนำหน้าอยู่แล้ว ${already} แถว (ข้าม)`);
  if (mismatched.length) {
    console.log(`⚠ ชื่อไม่ตรงกับ SchoolOS ${mismatched.length} แถว (ไม่แตะ):`);
    for (const m of mismatched.slice(0, 20)) console.log(`   · ${m}`);
    if (mismatched.length > 20) console.log(`   ... และอีก ${mismatched.length - 20} แถว`);
  }
  if (missing.length) {
    console.log(`⚠ ไม่พบคำนำหน้าของ ${missing.length} คน (ปล่อยชื่อเดิมไว้):`);
    for (const m of missing.slice(0, 20)) console.log(`   · ${m}`);
    if (missing.length > 20) console.log(`   ... และอีก ${missing.length - 20} คน`);
  }
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
