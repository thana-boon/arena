import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  numeric,
  text,
  date,
  time,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * หมายเหตุ: เก็บ json array (allowed_class_levels / audit detail) เป็น text
 * แล้ว validate/parse ที่ application layer เอง (คงพฤติกรรมเดิมจากตอนใช้ MySQL/MariaDB
 * เพื่อไม่ให้ต้องแก้ layer อื่น)
 * คอลัมน์ updated_at ใช้ .$onUpdate() ให้ Drizzle เซ็ตเวลาใหม่ทุกครั้งที่ update
 */

// ===== ปีการศึกษา =====
export const academicYears = pgTable("academic_years", {
  id: serial("id").primaryKey(),
  yearBe: integer("year_be").notNull(), // พ.ศ. เช่น 2569
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===== ตั้งค่าระบบ (ผูกกับปี) =====
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  yearId: integer("year_id").notNull(),
  maxEntriesPerStudent: integer("max_entries_per_student").notNull().default(2),
  registrationOpen: boolean("registration_open").notNull().default(false),
  regStart: timestamp("reg_start", { mode: "date" }),
  regEnd: timestamp("reg_end", { mode: "date" }),
  medalGoldPct: integer("medal_gold_pct").notNull().default(80),
  medalSilverPct: integer("medal_silver_pct").notNull().default(70),
  medalBronzePct: integer("medal_bronze_pct").notNull().default(60),
});

// ===== แคตตาล็อกหมวด (กลุ่มสาระ) — ซิงค์จาก Teacher API, ใช้ร่วมกันทั้งระบบ =====
// groupNo = ค่า subject_group ของครูใน Teacher API (ใช้ map เลข → ชื่อหมวด)
export const subjectGroupCatalog = pgTable("subject_group_catalog", {
  groupNo: integer("group_no").primaryKey(),
  name: varchar("name", { length: 191 }).notNull().default(""),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ===== หมวดวิชา (ต่อปีการศึกษา) — เลือกมาจากแคตตาล็อกที่ซิงค์จาก Teacher API =====
export const subjectGroups = pgTable("subject_groups", {
  id: serial("id").primaryKey(),
  yearId: integer("year_id").notNull(),
  catalogNo: integer("catalog_no"), // อ้างอิง subject_group_catalog.group_no (null = หมวดที่สร้างเองแบบเดิม)
  name: varchar("name", { length: 191 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ===== ช่วงเวลาแข่งขัน (time slot) — ต่อปีการศึกษา =====
// เช่น "ช่วงเช้า" 09:00–12:00 ; รายการแข่งขันต้องเลือกช่วงเวลาจากรายการนี้เท่านั้น
export const timeSlots = pgTable(
  "time_slots",
  {
    id: serial("id").primaryKey(),
    yearId: integer("year_id").notNull(),
    label: varchar("label", { length: 191 }).notNull(), // เช่น "ช่วงเช้า"
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("slot_year_idx").on(t.yearId)]
);

// ===== สถานที่แข่งขัน (venue) — master data ระดับ global ใช้ร่วมทุกปีการศึกษา =====
// name เป็น unique เพื่อรองรับ upsert-by-name ตอน import CSV
export const venues = pgTable("venues", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 191 }).notNull().unique(),
  building: varchar("building", { length: 191 }).notNull().default(""),
  note: varchar("note", { length: 255 }).notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===== แอดมิน local (ไม่ผ่าน API ภายนอก) =====
export const adminsLocal = pgTable("admins_local", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 191 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===== สิทธิ์ครู (admin/recorder) — key = teacher_code =====
export const teacherRoles = pgTable("teacher_roles", {
  teacherCode: varchar("teacher_code", { length: 64 }).primaryKey(),
  nameSnapshot: varchar("name_snapshot", { length: 191 }).notNull().default(""),
  isAdmin: boolean("is_admin").notNull().default(false),
  isRecorder: boolean("is_recorder").notNull().default(false),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ===== รายการแข่งขัน =====
export const competitions = pgTable(
  "competitions",
  {
    id: serial("id").primaryKey(),
    yearId: integer("year_id").notNull(),
    subjectGroupId: integer("subject_group_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").notNull().default(""), // รายละเอียด/กติกาของรายการ (แสดงให้นักเรียนเห็น)
    type: varchar("type", { length: 16 }).notNull(), // 'individual' | 'team'
    // โควตาของประเภทเดี่ยว: 'per_level' = แยกโควตาตามระดับชั้น | 'combined' = รวมทุกชั้นเป็นก้อนเดียว
    // (ประเภททีมเป็น pool เดียวเสมอ ไม่ใช้ค่านี้)
    capacityMode: varchar("capacity_mode", { length: 16 }).notNull().default("per_level"),
    teamSizeMin: integer("team_size_min"),
    teamSizeMax: integer("team_size_max"),
    allowedClassLevels: text("allowed_class_levels").notNull().default("[]"), // json array
    // ช่วงเวลาแข่งขัน — อ้างอิง time_slots.id (บังคับเลือกตอนสร้าง; nullable ในสคีมาเพื่อรองรับข้อมูลเดิม)
    timeSlotId: integer("time_slot_id"),
    // สถานที่แข่งขัน — อ้างอิง venues.id (nullable: venue เป็น optional + คงข้อมูลเดิม)
    venueId: integer("venue_id"),
    eventDate: date("event_date", { mode: "string" }),
    startTime: time("start_time"), // snapshot จาก slot ที่เลือก (ใช้ตรวจเวลาแข่งชนกัน + แสดงผล)
    endTime: time("end_time"),
    isPublished: boolean("is_published").notNull().default(false),
    // false = ครูลงให้อย่างเดียว นักเรียนมองไม่เห็น/สมัครเองไม่ได้
    visibleToStudents: boolean("visible_to_students").notNull().default(true),
    createdBy: varchar("created_by", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("comp_year_idx").on(t.yearId), index("comp_group_idx").on(t.subjectGroupId)]
);

// ===== ความจุที่นั่ง =====
// เดี่ยว: 1 แถวต่อระดับชั้น (class_level ระบุ)
// ทีม: 1 แถว (class_level = null)
export const competitionCapacity = pgTable(
  "competition_capacity",
  {
    id: serial("id").primaryKey(),
    competitionId: integer("competition_id").notNull(),
    classLevel: varchar("class_level", { length: 32 }), // null สำหรับทีม
    capacity: integer("capacity").notNull().default(0),
    registeredCount: integer("registered_count").notNull().default(0),
  },
  (t) => [index("cap_comp_idx").on(t.competitionId)]
);

// ===== เกณฑ์การให้คะแนน =====
export const criteria = pgTable(
  "criteria",
  {
    id: serial("id").primaryKey(),
    competitionId: integer("competition_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    maxScore: numeric("max_score", { precision: 6, scale: 2 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("crit_comp_idx").on(t.competitionId)]
);

// ===== การลงทะเบียน (entry) =====
// 1 แถว = 1 คน (เดี่ยว) หรือ 1 ทีม
export const entries = pgTable(
  "entries",
  {
    id: serial("id").primaryKey(),
    competitionId: integer("competition_id").notNull(),
    teamName: varchar("team_name", { length: 191 }), // null ถ้าเดี่ยว
    status: varchar("status", { length: 16 }).notNull().default("active"), // active | withdrawn
    createdByRole: varchar("created_by_role", { length: 16 }).notNull(),
    createdByCode: varchar("created_by_code", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("entry_comp_idx").on(t.competitionId)]
);

// ===== สมาชิกใน entry =====
export const entryMembers = pgTable(
  "entry_members",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id").notNull(),
    studentCode: varchar("student_code", { length: 64 }).notNull(),
    nameSnapshot: varchar("name_snapshot", { length: 191 }).notNull(),
    classLevelSnapshot: varchar("class_level_snapshot", { length: 32 }).notNull().default(""),
    classRoomSnapshot: varchar("class_room_snapshot", { length: 32 }).notNull().default(""),
  },
  (t) => [
    index("member_entry_idx").on(t.entryId),
    index("member_student_idx").on(t.studentCode),
  ]
);

// ===== คะแนน =====
export const scores = pgTable(
  "scores",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id").notNull(),
    criterionId: integer("criterion_id").notNull(),
    score: numeric("score", { precision: 6, scale: 2 }).notNull(),
    recordedBy: varchar("recorded_by", { length: 64 }).notNull(),
    recordedAt: timestamp("recorded_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("score_entry_crit_uniq").on(t.entryId, t.criterionId)]
);

// ===== audit log =====
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  who: varchar("who", { length: 128 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  detail: text("detail"), // json
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===== cache ข้อมูลจาก Student/Teacher API (snapshot) =====
export const teacherCache = pgTable("teacher_cache", {
  teacherCode: varchar("teacher_code", { length: 64 }).primaryKey(),
  data: text("data").notNull(), // json profile
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// types
export type AcademicYear = typeof academicYears.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type SubjectGroup = typeof subjectGroups.$inferSelect;
export type TimeSlot = typeof timeSlots.$inferSelect;
export type Venue = typeof venues.$inferSelect;
export type SubjectGroupCatalog = typeof subjectGroupCatalog.$inferSelect;
export type Competition = typeof competitions.$inferSelect;
export type CompetitionCapacity = typeof competitionCapacity.$inferSelect;
export type Criterion = typeof criteria.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type EntryMember = typeof entryMembers.$inferSelect;
export type Score = typeof scores.$inferSelect;
export type TeacherRole = typeof teacherRoles.$inferSelect;
