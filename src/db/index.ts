import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

// max = จำนวน connection สูงสุดต่อ process (ปรับผ่าน env ได้โดยไม่ต้องแก้โค้ด)
// ⚠️ ถ้ารัน PM2 cluster N instance รวมกันต้อง ≤ Postgres max_connections (default 100)
//    เช่น 4 instance × 20 = 80 → ยังปลอดภัย
const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX ?? 20),
    // รอ connection ว่างสูงสุด 10 วิ แล้วค่อย error — กันไม่ให้ตอนโหลดพีค request ค้างไม่มีกำหนด
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    // ตัด query ที่รันเกิน 30 วิฝั่ง Postgres — query ช้าตัวเดียวจะได้ไม่ถือ connection ค้าง
    // จนสะสมเต็ม pool แล้วทุก request ใหม่ตายที่ connectionTimeout พร้อมกันหมด
    // งานที่ตั้งใจให้นานกว่านี้ (restore) ใช้ SET LOCAL statement_timeout เองใน transaction
    statement_timeout: 30_000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema, pool };
