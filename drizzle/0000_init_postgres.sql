CREATE TABLE "academic_years" (
	"id" serial PRIMARY KEY NOT NULL,
	"year_be" integer NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admins_local" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(64) NOT NULL,
	"password_hash" varchar(191) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admins_local_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"who" varchar(128) NOT NULL,
	"action" varchar(64) NOT NULL,
	"detail" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition_capacity" (
	"id" serial PRIMARY KEY NOT NULL,
	"competition_id" integer NOT NULL,
	"class_level" varchar(32),
	"capacity" integer DEFAULT 0 NOT NULL,
	"registered_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"year_id" integer NOT NULL,
	"subject_group_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" varchar(16) NOT NULL,
	"capacity_mode" varchar(16) DEFAULT 'per_level' NOT NULL,
	"team_size_min" integer,
	"team_size_max" integer,
	"allowed_class_levels" text DEFAULT '[]' NOT NULL,
	"time_slot_id" integer,
	"venue_id" integer,
	"event_date" date,
	"start_time" time,
	"end_time" time,
	"is_published" boolean DEFAULT false NOT NULL,
	"visible_to_students" boolean DEFAULT true NOT NULL,
	"created_by" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criteria" (
	"id" serial PRIMARY KEY NOT NULL,
	"competition_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"max_score" numeric(6, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"competition_id" integer NOT NULL,
	"team_name" varchar(191),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_by_role" varchar(16) NOT NULL,
	"created_by_code" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"student_code" varchar(64) NOT NULL,
	"name_snapshot" varchar(191) NOT NULL,
	"class_level_snapshot" varchar(32) DEFAULT '' NOT NULL,
	"class_room_snapshot" varchar(32) DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"criterion_id" integer NOT NULL,
	"score" numeric(6, 2) NOT NULL,
	"recorded_by" varchar(64) NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"year_id" integer NOT NULL,
	"max_entries_per_student" integer DEFAULT 2 NOT NULL,
	"registration_open" boolean DEFAULT false NOT NULL,
	"reg_start" timestamp,
	"reg_end" timestamp,
	"medal_gold_pct" integer DEFAULT 80 NOT NULL,
	"medal_silver_pct" integer DEFAULT 70 NOT NULL,
	"medal_bronze_pct" integer DEFAULT 60 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject_group_catalog" (
	"group_no" integer PRIMARY KEY NOT NULL,
	"name" varchar(191) DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"year_id" integer NOT NULL,
	"catalog_no" integer,
	"name" varchar(191) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_cache" (
	"teacher_code" varchar(64) PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_roles" (
	"teacher_code" varchar(64) PRIMARY KEY NOT NULL,
	"name_snapshot" varchar(191) DEFAULT '' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_recorder" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"year_id" integer NOT NULL,
	"label" varchar(191) NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(191) NOT NULL,
	"building" varchar(191) DEFAULT '' NOT NULL,
	"note" varchar(255) DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "venues_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX "cap_comp_idx" ON "competition_capacity" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "comp_year_idx" ON "competitions" USING btree ("year_id");--> statement-breakpoint
CREATE INDEX "comp_group_idx" ON "competitions" USING btree ("subject_group_id");--> statement-breakpoint
CREATE INDEX "crit_comp_idx" ON "criteria" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "entry_comp_idx" ON "entries" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "member_entry_idx" ON "entry_members" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "member_student_idx" ON "entry_members" USING btree ("student_code");--> statement-breakpoint
CREATE UNIQUE INDEX "score_entry_crit_uniq" ON "scores" USING btree ("entry_id","criterion_id");--> statement-breakpoint
CREATE INDEX "slot_year_idx" ON "time_slots" USING btree ("year_id");