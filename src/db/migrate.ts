import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const connection = await mysql.createConnection({ uri: url, multipleStatements: true });
  const db = drizzle(connection);

  console.log("⏳ กำลังรัน migration...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✅ migration เสร็จสมบูรณ์");

  await connection.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ migration ล้มเหลว:", e);
  process.exit(1);
});
