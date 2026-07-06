import {
  mysqlTable,
  int,
  varchar,
  boolean,
  timestamp,
  datetime,
  decimal,
  text,
  date,
  time,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";

/**
 * หมายเหตุ: XAMPP ใช้ MariaDB → ไม่มี native json type ที่เชื่อถือได้เท่า MySQL 8
 * จึงเก็บ json array (allowed_class_levels / audit detail) เป็น LONGTEXT (`text`)
 * แล้ว validate/parse ที่ application layer เอง
 * ทุก table เป็น InnoDB (default ของ Drizzle mysql) เพื่อรองรับ transaction
 */

// ===== ปีการศึกษา =====
export const academicYears = mysqlTable("academic_years", {
  id: int("id").autoincrement().primaryKey(),
  yearBe: int("year_be").notNull(), // พ.ศ. เช่น 2569
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===== ตั้งค่าระบบ (ผูกกับปี) =====
export const settings = mysqlTable("settings", {
  id: int("id").autoincrement().primaryKey(),
  yearId: int("year_id").notNull(),
  maxEntriesPerStudent: int("max_entries_per_student").notNull().default(2),
  registrationOpen: boolean("registration_open").notNull().default(false),
  regStart: datetime("reg_start", { mode: "date" }),
  regEnd: datetime("reg_end", { mode: "date" }),
  medalGoldPct: int("medal_gold_pct").notNull().default(80),
  medalSilverPct: int("medal_silver_pct").notNull().default(70),
  medalBronzePct: int("medal_bronze_pct").notNull().default(60),
});

// ===== แคตตาล็อกหมวด (กลุ่มสาระ) — ซิงค์จาก Teacher API, ใช้ร่วมกันทั้งระบบ =====
// groupNo = ค่า subject_group ของครูใน Teacher API (ใช้ map เลข → ชื่อหมวด)
export const subjectGroupCatalog = mysqlTable("subject_group_catalog", {
  groupNo: int("group_no").primaryKey(),
  name: varchar("name", { length: 191 }).notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

// ===== หมวดวิชา (ต่อปีการศึกษา) — เลือกมาจากแคตตาล็อกที่ซิงค์จาก Teacher API =====
export const subjectGroups = mysqlTable("subject_groups", {
  id: int("id").autoincrement().primaryKey(),
  yearId: int("year_id").notNull(),
  catalogNo: int("catalog_no"), // อ้างอิง subject_group_catalog.group_no (null = หมวดที่สร้างเองแบบเดิม)
  name: varchar("name", { length: 191 }).notNull(),
  sortOrder: int("sort_order").notNull().default(0),
});

// ===== แอดมิน local (ไม่ผ่าน API ภายนอก) =====
export const adminsLocal = mysqlTable("admins_local", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 191 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===== สิทธิ์ครู (admin/recorder) — key = teacher_code =====
export const teacherRoles = mysqlTable("teacher_roles", {
  teacherCode: varchar("teacher_code", { length: 64 }).primaryKey(),
  nameSnapshot: varchar("name_snapshot", { length: 191 }).notNull().default(""),
  isAdmin: boolean("is_admin").notNull().default(false),
  isRecorder: boolean("is_recorder").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

// ===== รายการแข่งขัน =====
export const competitions = mysqlTable(
  "competitions",
  {
    id: int("id").autoincrement().primaryKey(),
    yearId: int("year_id").notNull(),
    subjectGroupId: int("subject_group_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    type: varchar("type", { length: 16 }).notNull(), // 'individual' | 'team'
    // โควตาของประเภทเดี่ยว: 'per_level' = แยกโควตาตามระดับชั้น | 'combined' = รวมทุกชั้นเป็นก้อนเดียว
    // (ประเภททีมเป็น pool เดียวเสมอ ไม่ใช้ค่านี้)
    capacityMode: varchar("capacity_mode", { length: 16 }).notNull().default("per_level"),
    teamSizeMin: int("team_size_min"),
    teamSizeMax: int("team_size_max"),
    allowedClassLevels: text("allowed_class_levels").notNull().default("[]"), // json array
    eventDate: date("event_date", { mode: "string" }),
    startTime: time("start_time"),
    endTime: time("end_time"),
    isPublished: boolean("is_published").notNull().default(false),
    createdBy: varchar("created_by", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    byYear: index("comp_year_idx").on(t.yearId),
    byGroup: index("comp_group_idx").on(t.subjectGroupId),
  })
);

// ===== ความจุที่นั่ง =====
// เดี่ยว: 1 แถวต่อระดับชั้น (class_level ระบุ)
// ทีม: 1 แถว (class_level = null)
export const competitionCapacity = mysqlTable(
  "competition_capacity",
  {
    id: int("id").autoincrement().primaryKey(),
    competitionId: int("competition_id").notNull(),
    classLevel: varchar("class_level", { length: 32 }), // null สำหรับทีม
    capacity: int("capacity").notNull().default(0),
    registeredCount: int("registered_count").notNull().default(0),
  },
  (t) => ({
    byComp: index("cap_comp_idx").on(t.competitionId),
  })
);

// ===== เกณฑ์การให้คะแนน =====
export const criteria = mysqlTable(
  "criteria",
  {
    id: int("id").autoincrement().primaryKey(),
    competitionId: int("competition_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    maxScore: decimal("max_score", { precision: 6, scale: 2 }).notNull(),
    sortOrder: int("sort_order").notNull().default(0),
  },
  (t) => ({
    byComp: index("crit_comp_idx").on(t.competitionId),
  })
);

// ===== การลงทะเบียน (entry) =====
// 1 แถว = 1 คน (เดี่ยว) หรือ 1 ทีม
export const entries = mysqlTable(
  "entries",
  {
    id: int("id").autoincrement().primaryKey(),
    competitionId: int("competition_id").notNull(),
    teamName: varchar("team_name", { length: 191 }), // null ถ้าเดี่ยว
    status: varchar("status", { length: 16 }).notNull().default("active"), // active | withdrawn
    createdByRole: varchar("created_by_role", { length: 16 }).notNull(),
    createdByCode: varchar("created_by_code", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    byComp: index("entry_comp_idx").on(t.competitionId),
  })
);

// ===== สมาชิกใน entry =====
export const entryMembers = mysqlTable(
  "entry_members",
  {
    id: int("id").autoincrement().primaryKey(),
    entryId: int("entry_id").notNull(),
    studentCode: varchar("student_code", { length: 64 }).notNull(),
    nameSnapshot: varchar("name_snapshot", { length: 191 }).notNull(),
    classLevelSnapshot: varchar("class_level_snapshot", { length: 32 }).notNull().default(""),
    classRoomSnapshot: varchar("class_room_snapshot", { length: 32 }).notNull().default(""),
  },
  (t) => ({
    byEntry: index("member_entry_idx").on(t.entryId),
    byStudent: index("member_student_idx").on(t.studentCode),
  })
);

// ===== คะแนน =====
export const scores = mysqlTable(
  "scores",
  {
    id: int("id").autoincrement().primaryKey(),
    entryId: int("entry_id").notNull(),
    criterionId: int("criterion_id").notNull(),
    score: decimal("score", { precision: 6, scale: 2 }).notNull(),
    recordedBy: varchar("recorded_by", { length: 64 }).notNull(),
    recordedAt: timestamp("recorded_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    uniq: uniqueIndex("score_entry_crit_uniq").on(t.entryId, t.criterionId),
  })
);

// ===== audit log =====
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  who: varchar("who", { length: 128 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  detail: text("detail"), // json
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===== cache ข้อมูลจาก Student/Teacher API (snapshot) =====
export const teacherCache = mysqlTable("teacher_cache", {
  teacherCode: varchar("teacher_code", { length: 64 }).primaryKey(),
  data: text("data").notNull(), // json profile
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

// types
export type AcademicYear = typeof academicYears.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type SubjectGroup = typeof subjectGroups.$inferSelect;
export type SubjectGroupCatalog = typeof subjectGroupCatalog.$inferSelect;
export type Competition = typeof competitions.$inferSelect;
export type CompetitionCapacity = typeof competitionCapacity.$inferSelect;
export type Criterion = typeof criteria.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type EntryMember = typeof entryMembers.$inferSelect;
export type Score = typeof scores.$inferSelect;
export type TeacherRole = typeof teacherRoles.$inferSelect;
