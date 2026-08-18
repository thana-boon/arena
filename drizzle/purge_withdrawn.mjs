/**
 * ล้างการลงทะเบียนที่ "ถอนแล้ว" ของเก่าทิ้ง — ใช้ DATABASE_URL จาก .env
 *   node drizzle/purge_withdrawn.mjs          ดูอย่างเดียวว่าจะลบอะไรบ้าง (ไม่แตะข้อมูล)
 *   node drizzle/purge_withdrawn.mjs --apply  ลบจริง
 * ปลอดภัยเมื่อรันซ้ำ (รอบสองจะไม่เหลืออะไรให้ลบ)
 *
 * ทำไมต้องมี: เดิมการยกเลิกการลงทะเบียนเป็น soft delete (entries.status = 'withdrawn')
 * ทุกหน้าจอกรอง status='active' ทิ้งอยู่แล้ว แถวพวกนี้จึงไม่มีใครได้ใช้ — โผล่ที่เดียวคือ
 * "ทะเบียนเกียรติบัตร" ซึ่งตั้งใจไม่กรองอะไรเลย เด็กที่สมัคร→ถอน→สมัครใหม่จึงขึ้นหลายแถว
 * ตอนนี้ขาถอนลบทิ้งจริงแล้ว (registration.ts → deleteEntry) สคริปต์นี้เก็บกวาดของที่ค้างมาก่อนหน้า
 *
 * ⚠ ไม่แตะ certificate_issues เลย และเว้น entry ที่มีใบผูกอยู่ไว้ทั้งแถว
 * ใบที่ออกไปแล้วอยู่ในมือนักเรียนจริงและเผาเลขทะเบียนของโรงเรียนไปแล้ว ต้องค้นเจอ/พิมพ์ซ้ำได้ตลอด
 *
 * ⚠ counter จำนวนผู้สมัคร (competition_capacity) ไม่ถูกแตะ — แถวพวกนี้หักออกไปตั้งแต่ตอนถอนแล้ว
 *
 * แนะนำให้สำรองฐานข้อมูลก่อน (ผู้ดูแลระบบ → สำรองข้อมูล) เพราะลบแล้วเอากลับไม่ได้
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;

const apply = process.argv.includes("--apply");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
let failed = false;

try {
  await client.query("BEGIN");

  // แถวที่จะลบ = ถอนแล้ว และไม่มีเกียรติบัตรใบไหนผูกอยู่
  await client.query(`
    CREATE TEMP TABLE doomed ON COMMIT DROP AS
    SELECT e.id FROM entries e
    WHERE e.status <> 'active'
      AND NOT EXISTS (SELECT 1 FROM certificate_issues ci WHERE ci.entry_id = e.id)
  `);

  const n = (await client.query(`SELECT count(*)::int AS n FROM doomed`)).rows[0].n;
  const people = (
    await client.query(
      `SELECT count(*)::int AS n FROM entry_members WHERE entry_id IN (SELECT id FROM doomed)`
    )
  ).rows[0].n;
  const kept = (
    await client.query(
      `SELECT count(*)::int AS n FROM entries e
       WHERE e.status <> 'active'
         AND EXISTS (SELECT 1 FROM certificate_issues ci WHERE ci.entry_id = e.id)`
    )
  ).rows[0].n;

  if (!apply) {
    await client.query("ROLLBACK");
    console.log("🔍 ทดลองดูเฉย ๆ ยังไม่ลบอะไร — ใส่ --apply เพื่อลบจริง");
    console.log(`   · การลงทะเบียนที่ถอนแล้วและจะถูกลบ: ${n} รายการ (รายชื่อ ${people} คน)`);
    console.log(`   · ที่ถอนแล้วแต่จะเก็บไว้เพราะมีเกียรติบัตรผูกอยู่: ${kept} รายการ`);
  } else {
    // สคีมานี้ไม่มี FK/ON DELETE CASCADE — ต้องไล่ลบลูกเองให้ครบ
    const scores = (await client.query(`DELETE FROM scores WHERE entry_id IN (SELECT id FROM doomed)`)).rowCount;
    const subs = (
      await client.query(`DELETE FROM entry_substitutions WHERE entry_id IN (SELECT id FROM doomed)`)
    ).rowCount;
    const members = (await client.query(`DELETE FROM entry_members WHERE entry_id IN (SELECT id FROM doomed)`))
      .rowCount;
    const ents = (await client.query(`DELETE FROM entries WHERE id IN (SELECT id FROM doomed)`)).rowCount;
    await client.query("COMMIT");

    console.log("✅ ล้างการลงทะเบียนที่ถอนแล้วเรียบร้อย");
    console.log(`   · entries ${ents} · entry_members ${members} · scores ${scores} · entry_substitutions ${subs}`);
    console.log(`   · เก็บไว้เพราะมีเกียรติบัตรผูกอยู่: ${kept} รายการ`);
    console.log("\n   หน้าทะเบียนเกียรติบัตรจะไม่ขึ้นแถวซ้ำของคนที่สมัครแล้วถอนอีกต่อไป");
  }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("❌ ล้มเหลว:", e.message);
  failed = true;
} finally {
  client.release();
  await pool.end();
}

if (failed) process.exit(1);
