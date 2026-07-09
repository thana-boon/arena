import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const connection = await mysql.createConnection({ uri: url });
  const db = drizzle(connection, { schema, mode: "default" });

  console.log("🌱 เริ่ม seed ข้อมูลตั้งต้น...");

  // ---- ปีการศึกษา 2569 (active) ----
  const existingYear = await db.select().from(schema.academicYears).where(eq(schema.academicYears.yearBe, 2569));
  let yearId: number;
  if (existingYear.length) {
    yearId = existingYear[0].id;
    console.log("  • ปี 2569 มีอยู่แล้ว");
  } else {
    const [res] = await db.insert(schema.academicYears).values({ yearBe: 2569, isActive: true });
    yearId = res.insertId;
    console.log("  • สร้างปีการศึกษา 2569 (active)");
  }

  // ---- settings ของปี ----
  const existingSettings = await db.select().from(schema.settings).where(eq(schema.settings.yearId, yearId));
  if (!existingSettings.length) {
    await db.insert(schema.settings).values({
      yearId,
      maxEntriesPerStudent: 2,
      registrationOpen: true,
      medalGoldPct: 80,
      medalSilverPct: 70,
      medalBronzePct: 60,
    });
    console.log("  • สร้าง settings เริ่มต้น (เปิดรับสมัคร, max 2 รายการ/คน)");
  }

  // ---- admin local ----
  const adminUser = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const adminPass = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";
  const existingAdmin = await db.select().from(schema.adminsLocal).where(eq(schema.adminsLocal.username, adminUser));
  if (!existingAdmin.length) {
    const hash = await bcrypt.hash(adminPass, 10);
    await db.insert(schema.adminsLocal).values({ username: adminUser, passwordHash: hash });
    console.log(`  • สร้าง admin local: ${adminUser} / ${adminPass}`);
  } else {
    console.log("  • admin local มีอยู่แล้ว");
  }

  // ---- หมวดวิชา ----
  const groupNames = [
    "ภาษาไทย",
    "คณิตศาสตร์",
    "วิทยาศาสตร์และเทคโนโลยี",
    "ภาษาต่างประเทศ",
  ];
  const existingGroups = await db.select().from(schema.subjectGroups).where(eq(schema.subjectGroups.yearId, yearId));
  const groupIdByName: Record<string, number> = {};
  for (const g of existingGroups) groupIdByName[g.name] = g.id;
  for (let i = 0; i < groupNames.length; i++) {
    if (!groupIdByName[groupNames[i]]) {
      const [r] = await db.insert(schema.subjectGroups).values({ yearId, name: groupNames[i], sortOrder: i });
      groupIdByName[groupNames[i]] = r.insertId;
    }
  }
  console.log(`  • หมวดวิชา: ${groupNames.join(", ")}`);

  // ---- ช่วงเวลาแข่งขัน (time slot) ----
  const slotDefs = [
    { label: "ช่วงเช้า", startTime: "09:00:00", endTime: "12:00:00" },
    { label: "ช่วงบ่าย", startTime: "13:00:00", endTime: "16:00:00" },
  ];
  const existingSlots = await db.select().from(schema.timeSlots).where(eq(schema.timeSlots.yearId, yearId));
  const slotIdByLabel: Record<string, number> = {};
  for (const s of existingSlots) slotIdByLabel[s.label] = s.id;
  for (let i = 0; i < slotDefs.length; i++) {
    if (!slotIdByLabel[slotDefs[i].label]) {
      const [r] = await db.insert(schema.timeSlots).values({ yearId, sortOrder: i, ...slotDefs[i] });
      slotIdByLabel[slotDefs[i].label] = r.insertId;
    }
  }
  console.log(`  • ช่วงเวลา: ${slotDefs.map((s) => s.label).join(", ")}`);

  // ---- ตัวอย่างรายการแข่งขัน (1 เดี่ยว + 1 ทีม) ----
  const existingComps = await db.select().from(schema.competitions).where(eq(schema.competitions.yearId, yearId));
  if (!existingComps.length) {
    // เดี่ยว: คัดลายมือ ม.ต้น
    const [c1] = await db.insert(schema.competitions).values({
      yearId,
      subjectGroupId: groupIdByName["ภาษาไทย"],
      name: "คัดลายมือ ระดับ ม.ต้น",
      type: "individual",
      allowedClassLevels: JSON.stringify(["ม.1", "ม.2", "ม.3"]),
      timeSlotId: slotIdByLabel["ช่วงเช้า"],
      eventDate: "2026-08-15",
      startTime: "09:00:00",
      endTime: "12:00:00",
      isPublished: false,
      createdBy: "seed",
    });
    // capacity per level
    for (const lv of ["ม.1", "ม.2", "ม.3"]) {
      await db.insert(schema.competitionCapacity).values({
        competitionId: c1.insertId,
        classLevel: lv,
        capacity: 20,
        registeredCount: 0,
      });
    }
    await db.insert(schema.criteria).values([
      { competitionId: c1.insertId, name: "ความสวยงาม", maxScore: "50.00", sortOrder: 0 },
      { competitionId: c1.insertId, name: "ความถูกต้อง", maxScore: "50.00", sortOrder: 1 },
    ]);

    // ทีม: ตอบปัญหาวิทยาศาสตร์
    const [c2] = await db.insert(schema.competitions).values({
      yearId,
      subjectGroupId: groupIdByName["วิทยาศาสตร์และเทคโนโลยี"],
      name: "ตอบปัญหาวิทยาศาสตร์ ระดับ ม.ปลาย",
      type: "team",
      teamSizeMin: 2,
      teamSizeMax: 3,
      allowedClassLevels: JSON.stringify(["ม.4", "ม.5", "ม.6"]),
      timeSlotId: slotIdByLabel["ช่วงบ่าย"],
      eventDate: "2026-08-15",
      startTime: "13:00:00",
      endTime: "16:00:00",
      isPublished: false,
      createdBy: "seed",
    });
    await db.insert(schema.competitionCapacity).values({
      competitionId: c2.insertId,
      classLevel: null,
      capacity: 12,
      registeredCount: 0,
    });
    await db.insert(schema.criteria).values([
      { competitionId: c2.insertId, name: "รอบทฤษฎี", maxScore: "60.00", sortOrder: 0 },
      { competitionId: c2.insertId, name: "รอบปฏิบัติ", maxScore: "40.00", sortOrder: 1 },
    ]);
    console.log("  • สร้างรายการตัวอย่าง 1 เดี่ยว + 1 ทีม");
  }

  console.log("✅ seed เสร็จสมบูรณ์");
  await connection.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ seed ล้มเหลว:", e);
  process.exit(1);
});
