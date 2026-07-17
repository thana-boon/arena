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
  // งานเริ่มต้น — ใช้ pre-select ตอนสร้างรายการแข่งขัน (กันเลือกงานผิด) ; null = ไม่มี default
  defaultEventId: integer("default_event_id"),
  // ⚠️ registrationOpen/regStart/regEnd ระดับปี ไม่ใช้แล้ว (ย้ายไปคุมที่ระดับงาน events) — คงคอลัมน์ไว้กันข้อมูลเดิมหาย
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
    // งานที่รายการนี้สังกัด (events.id) — เป็นเจ้าของช่วงรับสมัคร/การมองเห็น/ดีไซน์เกียรติบัตร
    // nullable ในสคีมาเพื่อรองรับข้อมูลเดิมก่อน backfill; หลัง backfill รายการทุกอันมีงานเสมอ
    eventId: integer("event_id"),
    // หมวดสาระ — optional: งานที่ไม่ใช่วิชาการ (อบรม/อื่น ๆ) ไม่ต้องเลือกหมวด (null = ไม่ระบุหมวด)
    subjectGroupId: integer("subject_group_id"),
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
  (t) => [
    index("comp_year_idx").on(t.yearId),
    index("comp_group_idx").on(t.subjectGroupId),
    index("comp_event_idx").on(t.eventId),
  ]
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

// ===== เกียรติบัตร: ไฟล์รูป (พื้นหลัง / ลายเซ็น) =====
// เก็บรูปเป็น base64 ใน text ไม่ใช่ bytea เพราะ lib/backup.ts ทำ backup ด้วย SELECT * + JSON.stringify
// ถ้าเป็น bytea จะได้ Buffer แล้ว JSON.stringify ออกมาเป็น {"type":"Buffer","data":[...]} ซึ่งใหญ่กว่าเดิมและ restore ไม่กลับ
// ฝั่ง client ย่อ+แปลงเป็น WebP ก่อนอัปโหลดเสมอ (ดู lib/imageCompress.ts) เซิร์ฟเวอร์ตรวจขนาดซ้ำอีกชั้น
export const certificateAssets = pgTable("certificate_assets", {
  id: serial("id").primaryKey(),
  kind: varchar("kind", { length: 16 }).notNull(), // 'background' | 'signature'
  name: varchar("name", { length: 191 }).notNull().default(""),
  mime: varchar("mime", { length: 64 }).notNull(), // image/webp | image/png | image/jpeg
  data: text("data").notNull(), // base64 (ไม่มี data: prefix)
  bytes: integer("bytes").notNull().default(0),
  width: integer("width").notNull().default(0),
  height: integer("height").notNull().default(0),
  createdBy: varchar("created_by", { length: 64 }).notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===== งาน (Event) — แกนกลางของระบบ =====
// 1 งาน เช่น "วันวิชาการ 2569" หรือ "อบรม Python ครู" ครอบหลายรายการ (competitions.event_id)
// เป็นเจ้าของ: ช่วงเปิด-ปิดรับสมัคร, การมองเห็นของนักเรียน, และดีไซน์เกียรติบัตร
// kind: 'competition' = งานแข่งขัน (มีคะแนน/อันดับ) | 'training' = อบรม (ผู้เข้าร่วม → เกียรติบัตร ไม่มีคะแนน)
// status (ของฝั่งเกียรติบัตร): draft = admin แก้ได้ | published = ครู export ได้ | locked = ออกใบแรกแล้ว ต้องปลดล็อกก่อนแก้
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    yearId: integer("year_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    kind: varchar("kind", { length: 16 }).notNull().default("competition"),
    eventDate: date("event_date", { mode: "string" }),
    // การรับสมัคร — ย้ายมาจาก settings ระดับปี ให้แต่ละงานคุมเอง
    visibleToStudents: boolean("visible_to_students").notNull().default(false),
    registrationOpen: boolean("registration_open").notNull().default(false),
    regStart: timestamp("reg_start", { mode: "date" }),
    regEnd: timestamp("reg_end", { mode: "date" }),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    createdBy: varchar("created_by", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("event_year_idx").on(t.yearId)]
);

// ===== เกียรติบัตร: แม่แบบ (พื้นหลัง + ตำแหน่งข้อความ) =====
// medalFilter = '' คือแม่แบบหลักของงาน; ใส่ 'gold'/'silver'/'bronze' เพื่อ override เฉพาะเหรียญนั้น
// ใช้ '' แทน null เพราะ Postgres ถือว่า null แต่ละตัวไม่ซ้ำกัน → unique(event_id, medal_filter) จะกันซ้ำไม่ได้
// layout เก็บ json array ของ block (ดู CertLayout ใน lib/certificates.ts) พิกัดเป็น % ของหน้ากระดาษ
export const certificateTemplates = pgTable(
  "certificate_templates",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id").notNull(),
    medalFilter: varchar("medal_filter", { length: 16 }).notNull().default(""),
    backgroundAssetId: integer("background_asset_id"),
    orientation: varchar("orientation", { length: 16 }).notNull().default("landscape"),
    layout: text("layout").notNull().default("[]"), // json array
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("cert_tpl_event_medal_uniq").on(t.eventId, t.medalFilter)]
);

// ===== เกียรติบัตร: ผู้ลงนาม =====
// mode: 'image' = ลายเซ็นดิจิทัล (วางรูปจาก asset) | 'blank' = เว้นเส้นไว้เซ็นสด
// เก็บพิกัดไว้ที่แถวนี้เลย ไม่ปนใน layout json เพื่อไม่ให้ตำแหน่งลายเซ็นมีสองแหล่งความจริง
export const certificateSignatures = pgTable(
  "certificate_signatures",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    name: varchar("name", { length: 191 }).notNull().default(""), // ชื่อผู้ลงนาม
    roleLabel: varchar("role_label", { length: 191 }).notNull().default(""), // เช่น "ผู้อำนวยการโรงเรียน"
    mode: varchar("mode", { length: 16 }).notNull().default("blank"),
    assetId: integer("asset_id"), // ใช้เมื่อ mode = 'image'
    x: numeric("x", { precision: 6, scale: 3 }).notNull().default("50"), // % จุดกึ่งกลางแนวนอน
    y: numeric("y", { precision: 6, scale: 3 }).notNull().default("75"), // % จากขอบบน
    width: numeric("width", { precision: 6, scale: 3 }).notNull().default("18"), // % ของความกว้างหน้า
  },
  (t) => [index("cert_sig_tpl_idx").on(t.templateId)]
);

// ===== เกียรติบัตร: ทะเบียนคุม =====
// 1 แถว = เกียรติบัตร 1 ใบที่ออกจริง (เลขทะเบียนถูกจอง ณ ตอน insert เท่านั้น)
// snapshot ทุกอย่างที่พิมพ์ลงกระดาษ เพื่อให้ใบที่แจกไปแล้วตรวจสอบย้อนหลังได้ แม้ข้อมูลต้นทางจะถูกแก้ทีหลัง
// unique(competition_id, entry_id, student_code) → กดออกซ้ำได้เลขเดิม ไม่เผาเลขใหม่ (นับที่ reprint_count แทน)
export const certificateIssues = pgTable(
  "certificate_issues",
  {
    id: serial("id").primaryKey(),
    serialNo: varchar("serial_no", { length: 32 }).notNull().unique(), // "2569/0042"
    verifyToken: varchar("verify_token", { length: 32 }).notNull().unique(), // สุ่ม ใช้ทำ QR
    yearId: integer("year_id").notNull(),
    eventId: integer("event_id").notNull(),
    competitionId: integer("competition_id").notNull(),
    entryId: integer("entry_id").notNull(),
    studentCode: varchar("student_code", { length: 64 }).notNull(),
    templateId: integer("template_id").notNull(),
    // snapshot ณ เวลาออกใบ
    nameSnapshot: varchar("name_snapshot", { length: 191 }).notNull(),
    classSnapshot: varchar("class_snapshot", { length: 32 }).notNull().default(""),
    teamNameSnapshot: varchar("team_name_snapshot", { length: 191 }),
    competitionNameSnapshot: varchar("competition_name_snapshot", { length: 255 }).notNull(),
    eventNameSnapshot: varchar("event_name_snapshot", { length: 255 }).notNull(),
    yearBeSnapshot: integer("year_be_snapshot").notNull(),
    medal: varchar("medal", { length: 16 }).notNull().default("none"),
    rank: integer("rank").notNull().default(0),
    percent: numeric("percent", { precision: 6, scale: 2 }).notNull().default("0"),
    issuedBy: varchar("issued_by", { length: 64 }).notNull(),
    issuedAt: timestamp("issued_at").notNull().defaultNow(),
    reprintCount: integer("reprint_count").notNull().default(0),
    revokedAt: timestamp("revoked_at"),
    revokeReason: varchar("revoke_reason", { length: 255 }),
  },
  (t) => [
    uniqueIndex("cert_issue_target_uniq").on(t.competitionId, t.entryId, t.studentCode),
    index("cert_issue_event_idx").on(t.eventId),
    index("cert_issue_comp_idx").on(t.competitionId),
  ]
);

// ===== เกียรติบัตร: ตัวเดินเลขทะเบียน (ต่อปีการศึกษา) =====
// เลขวิ่งต่อเนื่องทั้งปี ข้ามงาน (รูปแบบโรงเรียน: 2569/0001, 2569/0002, ...)
// จึงต้องอยู่ระดับปี ไม่ใช่ระดับงาน ไม่งั้นงานที่สองจะเริ่มนับ 1 ใหม่แล้วเลขชนกัน
// lastNo = เลขล่าสุดที่แจกไปแล้ว (0 = ยังไม่เคยออกใบในปีนี้)
export const certificateCounters = pgTable("certificate_counters", {
  yearId: integer("year_id").primaryKey(),
  lastNo: integer("last_no").notNull().default(0),
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
export type CertificateAsset = typeof certificateAssets.$inferSelect;
export type CertificateTemplate = typeof certificateTemplates.$inferSelect;
export type CertificateSignature = typeof certificateSignatures.$inferSelect;
export type CertificateIssue = typeof certificateIssues.$inferSelect;
export type EventRow = typeof events.$inferSelect;
