import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import * as schema from "./schema";

/**
 * ตั้ง/รีเซ็ตรหัสผ่าน admin local — ใช้ตอนลืมรหัส หรืออยากเปลี่ยนรหัสบน prod
 *
 *   npm run admin:password -- <username> [password]
 *
 * ไม่ใส่ password → สุ่มให้แล้วพิมพ์ออกมา
 * ถ้า username ยังไม่มีในระบบ จะสร้างบัญชีใหม่ให้ (ถามยืนยันไม่ได้ — ระบุ username ให้ถูก)
 *
 * ในคอนเทนเนอร์:  docker compose exec app npm run admin:password -- admin
 */
async function main() {
  const [username, passwordArg] = process.argv.slice(2);
  if (!username) {
    console.error("วิธีใช้: npm run admin:password -- <username> [password]");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  const password = passwordArg || randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await db
    .select({ id: schema.adminsLocal.id })
    .from(schema.adminsLocal)
    .where(eq(schema.adminsLocal.username, username));

  if (existing.length) {
    await db
      .update(schema.adminsLocal)
      .set({ passwordHash })
      .where(eq(schema.adminsLocal.username, username));
    console.log(`✅ เปลี่ยนรหัสผ่านของ "${username}" เรียบร้อย`);
  } else {
    await db.insert(schema.adminsLocal).values({ username, passwordHash });
    console.log(`✅ สร้าง admin ใหม่ "${username}" เรียบร้อย`);
  }

  if (!passwordArg) console.log(`   รหัสผ่านใหม่: ${password}`);

  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ ตั้งรหัสผ่านไม่สำเร็จ:", e);
  process.exit(1);
});
