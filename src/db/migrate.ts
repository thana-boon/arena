import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  console.log("⏳ กำลังรัน migration...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✅ migration เสร็จสมบูรณ์");

  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ migration ล้มเหลว:", e);
  process.exit(1);
});
