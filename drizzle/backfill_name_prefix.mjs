/**
 * เติม "คำนำหน้าชื่อ" ย้อนหลังให้ข้อมูลที่บันทึกไว้ก่อนระบบจะเก็บคำนำหน้า
 *
 *   node drizzle/backfill_name_prefix.mjs --dry          # ดูก่อนว่าจะเติมกี่แถว ไม่แตะฐานข้อมูล
 *   node drizzle/backfill_name_prefix.mjs                # เติมจริง (ทั้งผู้สมัครและใบที่ออกแล้ว)
 *   node drizzle/backfill_name_prefix.mjs --skip-certs   # เติมเฉพาะผู้สมัคร ไม่แตะใบที่ออกไปแล้ว
 *
 * ไม่มีคอลัมน์ใหม่ — คำนำหน้าอยู่ใน name_snapshot เลย ("เด็กหญิงสมหญิง ใจดี")
 * เอกสารทุกใบอ่านจากคอลัมน์นี้อยู่แล้ว จึงได้คำนำหน้าพร้อมกันทั้งเกียรติบัตร/ใบรายชื่อ/ใบกรอกคะแนน
 *
 * ชื่อถูก snapshot ไว้ "สองที่" ต้องเติมทั้งคู่:
 *   · entry_members.name_snapshot      — ชื่อ ณ ตอนสมัคร (ใบรายชื่อ/ใบกรอกคะแนน/ใบที่จะออกใหม่)
 *   · certificate_issues.name_snapshot — ชื่อ ณ ตอนออกใบ (ใบที่ออกไปแล้ว + หน้า QR ตรวจสอบ)
 * ⚠ ใบที่ปริ้นแจกไปแล้วบนกระดาษจะไม่ตรงกับที่พิมพ์ซ้ำหลังเติม (ต่างกันแค่คำนำหน้า)
 *   ถ้ารับไม่ได้ ใช้ --skip-certs แล้วปล่อยใบเก่าไว้อย่างนั้น
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
const skipCerts = process.argv.includes("--skip-certs");

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

/**
 * เติมคำนำหน้าให้ทีละตาราง — ตรรกะเดียวกันทั้งคู่ ต่างแค่ชื่อตาราง
 * เขียนทับเฉพาะแถวที่ชื่อเดิมตรงกับ "ชื่อ นามสกุล" ของนักเรียนคนนั้นเป๊ะ ๆ เท่านั้น
 */
async function backfill(table, byCode) {
  const { rows } = await pool.query(`SELECT id, student_code, name_snapshot FROM ${table}`);
  const res = { total: rows.length, filled: 0, already: 0, missing: [], mismatched: [] };
  for (const row of rows) {
    const s = byCode.get(String(row.student_code));
    const prefix = (s?.prefix ?? "").trim();
    if (!s || !prefix) {
      res.missing.push(`${row.name_snapshot} (${row.student_code})`);
      continue;
    }
    const plain = `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim();
    const stored = (row.name_snapshot ?? "").trim();
    if (stored === `${prefix}${plain}`) {
      res.already++;
      continue;
    }
    if (stored !== plain) {
      // ชื่อที่เก็บไว้ไม่ใช่ "ชื่อ นามสกุล" เปล่า ๆ ของคนนี้ — อาจมีคำนำหน้าแบบอื่น หรือถูกแก้ไว้
      // ไม่เดาแทน เพราะ snapshot คือหลักฐานว่าตอนนั้นเอกสารพิมพ์ชื่ออะไร
      res.mismatched.push(`${stored} → คาดว่า "${plain}" (${row.student_code})`);
      continue;
    }
    if (!dryRun) {
      // กัน race กับการแก้ไขที่เกิดระหว่างสคริปต์ทำงาน: เขียนทับเฉพาะแถวที่ยังเป็นชื่อเดิมจริง
      await pool.query(`UPDATE ${table} SET name_snapshot = $1 WHERE id = $2 AND name_snapshot = $3`, [
        `${prefix}${plain}`,
        row.id,
        row.name_snapshot,
      ]);
    }
    res.filled++;
  }
  return res;
}

function report(label, r) {
  console.log(`\n── ${label} (${r.total} แถว) ──`);
  console.log(dryRun ? `[dry run] จะเติมได้ ${r.filled} แถว` : `✅ เติมคำนำหน้าแล้ว ${r.filled} แถว`);
  if (r.already) console.log(`· มีคำนำหน้าอยู่แล้ว ${r.already} แถว (ข้าม)`);
  for (const [head, list] of [
    ["ชื่อไม่ตรงกับ SchoolOS (ไม่แตะ)", r.mismatched],
    ["ไม่พบคำนำหน้า (ปล่อยชื่อเดิมไว้)", r.missing],
  ]) {
    if (!list.length) continue;
    console.log(`⚠ ${head} ${list.length} แถว:`);
    for (const m of list.slice(0, 20)) console.log(`   · ${m}`);
    if (list.length > 20) console.log(`   ... และอีก ${list.length - 20} แถว`);
  }
}

try {
  const students = await fetchAllStudents();
  const byCode = new Map(students.map((s) => [String(s.studentCode), s]));
  const withPrefix = students.filter((s) => (s.prefix ?? "").trim()).length;
  console.log(`ได้รายชื่อจาก SchoolOS ${students.length} คน (มีคำนำหน้า ${withPrefix} คน)`);

  report("ผู้สมัคร (entry_members)", await backfill("entry_members", byCode));

  // ใบที่ออกไปแล้วเก็บชื่อของตัวเองแยกอีกชุด (snapshot ณ เวลาออกใบ) — ถ้าไม่เติมด้วย
  // ใบเก่าจะพิมพ์ชื่อไม่มีคำนำหน้าตลอดไป ทั้งตอนพิมพ์ซ้ำและบนหน้า QR ตรวจสอบ
  if (skipCerts) console.log("\n(ข้าม certificate_issues ตาม --skip-certs — ใบที่ออกไปแล้วจะยังไม่มีคำนำหน้า)");
  else report("เกียรติบัตรที่ออกแล้ว (certificate_issues)", await backfill("certificate_issues", byCode));
} catch (e) {
  // AggregateError (เช่น ต่อ DB ไม่ติดทั้ง IPv4/IPv6) มี message ว่าง — ถ้าไม่กาง .errors ออกมา
  // จะเห็นแค่ "❌ ล้มเหลว:" เปล่า ๆ แล้วไล่สาเหตุบนเครื่อง prod ไม่ได้เลย
  const detail = e?.errors?.length ? e.errors.map((x) => x.message).join(" · ") : e?.message || String(e);
  console.error("❌ ล้มเหลว:", detail);
  process.exit(1);
} finally {
  await pool.end();
}
