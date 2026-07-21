import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import * as schema from "./schema";

/**
 * Auto-bootstrap — รันทุกครั้งที่คอนเทนเนอร์สตาร์ท แต่ "ไม่ทำอะไรเลย" ถ้าระบบตั้งต้นไว้แล้ว
 * ต่างจาก seed.ts ตรงที่ไม่มี demo data (หมวดวิชา/ช่วงเวลา/รายการตัวอย่าง) — ใส่แค่ของที่ระบบขาดไม่ได้
 *
 * เงื่อนไขการสร้าง admin: ตาราง admins_local ต้องว่างเปล่าเท่านั้น
 * ถ้ามี admin อยู่แล้วแม้แต่คนเดียว → ข้าม ไม่สร้างเพิ่ม ไม่แตะรหัสผ่านเดิม
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  console.log("🚀 auto-bootstrap: ตรวจสอบข้อมูลตั้งต้น...");

  // ---- ปีการศึกษา active ----
  // สร้างเฉพาะตอนยังไม่มีปีใดเลยในระบบ (DB เปล่าจริง ๆ)
  const [{ count: yearCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.academicYears);

  let yearId: number;
  if (yearCount === 0) {
    const yearBe = Number(process.env.BOOTSTRAP_YEAR_BE) || new Date().getFullYear() + 543;
    const [res] = await db
      .insert(schema.academicYears)
      .values({ yearBe, isActive: true })
      .returning({ id: schema.academicYears.id });
    yearId = res.id;
    console.log(`  • สร้างปีการศึกษา ${yearBe} (active)`);

    await db.insert(schema.settings).values({ yearId });
    console.log("  • สร้าง settings เริ่มต้นของปี");
  } else {
    console.log("  • มีปีการศึกษาอยู่แล้ว — ข้าม");
  }

  // ---- admin local ----
  const [{ count: adminCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.adminsLocal);

  if (adminCount > 0) {
    console.log(`  • มี admin local อยู่แล้ว (${adminCount} บัญชี) — ข้าม ไม่แตะรหัสผ่านเดิม`);
  } else {
    // รับได้ทั้ง BOOTSTRAP_* และ SEED_* (ชุดหลังคือชื่อที่ seed.ts ใช้และมีอยู่ใน .env จริง)
    const username =
      process.env.BOOTSTRAP_ADMIN_USERNAME || process.env.SEED_ADMIN_USERNAME || "admin";
    const envPass = process.env.BOOTSTRAP_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
    // ไม่ตั้งรหัสใน .env → สุ่มให้ แล้วพิมพ์ลง log ครั้งเดียว (ปลอดภัยกว่ารหัส default ตายตัว)
    const password = envPass || randomBytes(9).toString("base64url");

    await db.insert(schema.adminsLocal).values({
      username,
      passwordHash: await bcrypt.hash(password, 10),
    });

    console.log("");
    console.log("  ┌─────────────────────────────────────────────");
    console.log("  │ สร้าง admin local ครั้งแรก");
    console.log(`  │   username: ${username}`);
    if (envPass) {
      console.log("  │   password: (ตามค่าใน BOOTSTRAP_ADMIN_PASSWORD / SEED_ADMIN_PASSWORD)");
    } else {
      console.log(`  │   password: ${password}`);
      console.log("  │ ⚠️  รหัสนี้แสดงครั้งเดียว — จดไว้แล้วเปลี่ยนหลัง login");
    }
    console.log("  └─────────────────────────────────────────────");
    console.log("");
  }

  console.log("✅ auto-bootstrap เสร็จสมบูรณ์");
  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ auto-bootstrap ล้มเหลว:", e);
  process.exit(1);
});
