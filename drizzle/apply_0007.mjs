/**
 * สร้างตาราง announcements (ประกาศบนทุกหน้าหลังล็อกอิน) — ใช้ DATABASE_URL จาก .env
 *   node drizzle/apply_0007.mjs
 * ปลอดภัยเมื่อรันซ้ำ (CREATE TABLE IF NOT EXISTS)
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const has = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='announcements'`
  );
  if (has.rowCount) {
    console.log("✔ มีตาราง announcements แล้ว — ข้าม");
  } else {
    await pool.query(`
      CREATE TABLE "announcements" (
        "id" serial PRIMARY KEY NOT NULL,
        "title" varchar(191) DEFAULT '' NOT NULL,
        "body" text NOT NULL,
        "level" varchar(16) DEFAULT 'info' NOT NULL,
        "audience" varchar(16) DEFAULT 'all' NOT NULL,
        "is_active" boolean DEFAULT false NOT NULL,
        "dismissible" boolean DEFAULT true NOT NULL,
        "created_by" varchar(64) DEFAULT '' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query(`CREATE INDEX "ann_active_idx" ON "announcements" ("is_active")`);
    console.log("✅ สร้างตาราง announcements แล้ว");
  }
} catch (e) {
  console.error("❌ ล้มเหลว:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
