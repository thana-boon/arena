/**
 * ย้าย competitions.venue_id → ตารางเชื่อม competition_venues (หลายห้องต่อรายการ)
 *   node drizzle/apply_0004.mjs
 *
 * เป็นตัวรันของ 0004_competition_venues.sql — ปลอดภัยเมื่อรันซ้ำ (เช็คทีละขั้นก่อนทำ)
 * และครอบ transaction ไว้ทั้งก้อน: ถ้าขั้นไหนพัง จะไม่เหลือ schema ค้างครึ่ง ๆ กลาง ๆ
 *
 * ต้องรัน "ก่อน" db:push เสมอ — ไม่งั้น push จะเจอกรณีกำกวม (venue_id หาย + allow_cross_class โผล่)
 * แล้วถามว่า rename หรือเปล่า ดู [[arena-drizzle-push-prompts]]
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

const hasTable = async (name) =>
  (await client.query(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [name]))
    .rowCount > 0;
const hasColumn = async (table, col) =>
  (await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [table, col]))
    .rowCount > 0;

try {
  await client.query("BEGIN");

  if (await hasTable("competition_venues")) {
    console.log("✔ มีตาราง competition_venues แล้ว — ข้าม");
  } else {
    await client.query(`
      CREATE TABLE "competition_venues" (
        "id" serial PRIMARY KEY NOT NULL,
        "competition_id" integer NOT NULL,
        "venue_id" integer NOT NULL,
        "sort_order" integer DEFAULT 0 NOT NULL
      )`);
    await client.query(`CREATE UNIQUE INDEX "comp_venue_uniq" ON "competition_venues" USING btree ("competition_id","venue_id")`);
    await client.query(`CREATE INDEX "comp_venue_venue_idx" ON "competition_venues" USING btree ("venue_id")`);
    console.log("✅ สร้างตาราง competition_venues แล้ว");
  }

  // backfill + drop ทำเฉพาะตอนคอลัมน์เก่ายังอยู่ (รันรอบสองจะข้ามทั้งคู่)
  if (await hasColumn("competitions", "venue_id")) {
    const moved = await client.query(`
      INSERT INTO "competition_venues" ("competition_id", "venue_id", "sort_order")
        SELECT "id", "venue_id", 0 FROM "competitions" WHERE "venue_id" IS NOT NULL
      ON CONFLICT DO NOTHING`);
    await client.query(`ALTER TABLE "competitions" DROP COLUMN "venue_id"`);
    console.log(`✅ ย้ายห้องเดิม ${moved.rowCount} รายการ แล้วลบคอลัมน์ competitions.venue_id`);
  } else {
    console.log("✔ ไม่มีคอลัมน์ competitions.venue_id แล้ว — ข้าม backfill");
  }

  await client.query("COMMIT");
  console.log("🎉 0004 เรียบร้อย");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("❌ ล้มเหลว (rollback แล้ว ไม่มีอะไรเปลี่ยน):", e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
