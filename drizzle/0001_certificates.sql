CREATE TABLE "certificate_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" varchar(16) NOT NULL,
	"name" varchar(191) DEFAULT '' NOT NULL,
	"mime" varchar(64) NOT NULL,
	"data" text NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"width" integer DEFAULT 0 NOT NULL,
	"height" integer DEFAULT 0 NOT NULL,
	"created_by" varchar(64) DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificate_counters" (
	"year_id" integer PRIMARY KEY NOT NULL,
	"last_no" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificate_event_competitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"competition_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificate_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"year_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"event_date" date,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"created_by" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificate_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"serial_no" varchar(32) NOT NULL,
	"verify_token" varchar(32) NOT NULL,
	"year_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"competition_id" integer NOT NULL,
	"entry_id" integer NOT NULL,
	"student_code" varchar(64) NOT NULL,
	"template_id" integer NOT NULL,
	"name_snapshot" varchar(191) NOT NULL,
	"class_snapshot" varchar(32) DEFAULT '' NOT NULL,
	"team_name_snapshot" varchar(191),
	"competition_name_snapshot" varchar(255) NOT NULL,
	"event_name_snapshot" varchar(255) NOT NULL,
	"year_be_snapshot" integer NOT NULL,
	"medal" varchar(16) DEFAULT 'none' NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"percent" numeric(6, 2) DEFAULT '0' NOT NULL,
	"issued_by" varchar(64) NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"reprint_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp,
	"revoke_reason" varchar(255),
	CONSTRAINT "certificate_issues_serial_no_unique" UNIQUE("serial_no"),
	CONSTRAINT "certificate_issues_verify_token_unique" UNIQUE("verify_token")
);
--> statement-breakpoint
CREATE TABLE "certificate_signatures" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"name" varchar(191) DEFAULT '' NOT NULL,
	"role_label" varchar(191) DEFAULT '' NOT NULL,
	"mode" varchar(16) DEFAULT 'blank' NOT NULL,
	"asset_id" integer,
	"x" numeric(6, 3) DEFAULT '50' NOT NULL,
	"y" numeric(6, 3) DEFAULT '75' NOT NULL,
	"width" numeric(6, 3) DEFAULT '18' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificate_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"medal_filter" varchar(16) DEFAULT '' NOT NULL,
	"background_asset_id" integer,
	"orientation" varchar(16) DEFAULT 'landscape' NOT NULL,
	"layout" text DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cert_event_comp_uniq" ON "certificate_event_competitions" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "cert_event_comp_event_idx" ON "certificate_event_competitions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "cert_event_year_idx" ON "certificate_events" USING btree ("year_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cert_issue_target_uniq" ON "certificate_issues" USING btree ("competition_id","entry_id","student_code");--> statement-breakpoint
CREATE INDEX "cert_issue_event_idx" ON "certificate_issues" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "cert_issue_comp_idx" ON "certificate_issues" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "cert_sig_tpl_idx" ON "certificate_signatures" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cert_tpl_event_medal_uniq" ON "certificate_templates" USING btree ("event_id","medal_filter");