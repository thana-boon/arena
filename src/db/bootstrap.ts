import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

/**
 * Auto-bootstrap — รันทุกครั้งที่คอนเทนเนอร์สตาร์ท แต่ "ไม่ทำอะไรเลย" ถ้าระบบตั้งต้นไว้แล้ว
 *
 * ไม่มีการสร้าง admin อีกต่อไป — สิทธิ์ admin มาจาก role "teacher-admin" ของ SchoolOS โดยตรง
 * (ดู src/app/api/auth/login/route.ts) ครูที่ SchoolOS กำหนดเป็น teacher-admin จะเข้าเป็น admin เอง
 * ถ้าต้องมอบ admin/recorder เพิ่มแบบมือ ทำผ่านหน้า /admin/teachers
 *
 * เหลือหน้าที่เดียว: ถ้า DB เปล่าจริง ๆ (ยังไม่มีปีการศึกษาเลย) ให้สร้างปี active + settings ตั้งต้น
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

  if (yearCount === 0) {
    const yearBe = Number(process.env.BOOTSTRAP_YEAR_BE) || new Date().getFullYear() + 543;
    const [res] = await db
      .insert(schema.academicYears)
      .values({ yearBe, isActive: true })
      .returning({ id: schema.academicYears.id });
    console.log(`  • สร้างปีการศึกษา ${yearBe} (active)`);

    await db.insert(schema.settings).values({ yearId: res.id });
    console.log("  • สร้าง settings เริ่มต้นของปี");
  } else {
    console.log("  • มีปีการศึกษาอยู่แล้ว — ข้าม");
  }

  console.log("✅ auto-bootstrap เสร็จสมบูรณ์");
  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ auto-bootstrap ล้มเหลว:", e);
  process.exit(1);
});
