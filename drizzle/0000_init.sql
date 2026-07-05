CREATE TABLE `academic_years` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year_be` int NOT NULL,
	`is_active` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `academic_years_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `admins_local` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`password_hash` varchar(191) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admins_local_id` PRIMARY KEY(`id`),
	CONSTRAINT `admins_local_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`who` varchar(128) NOT NULL,
	`action` varchar(64) NOT NULL,
	`detail` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `competition_capacity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`competition_id` int NOT NULL,
	`class_level` varchar(32),
	`capacity` int NOT NULL DEFAULT 0,
	`registered_count` int NOT NULL DEFAULT 0,
	CONSTRAINT `competition_capacity_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `competitions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year_id` int NOT NULL,
	`subject_group_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` varchar(16) NOT NULL,
	`team_size_min` int,
	`team_size_max` int,
	`allowed_class_levels` text NOT NULL DEFAULT ('[]'),
	`event_date` date,
	`start_time` time,
	`end_time` time,
	`is_published` boolean NOT NULL DEFAULT false,
	`created_by` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `competitions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `criteria` (
	`id` int AUTO_INCREMENT NOT NULL,
	`competition_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`max_score` decimal(6,2) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `criteria_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`competition_id` int NOT NULL,
	`team_name` varchar(191),
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`created_by_role` varchar(16) NOT NULL,
	`created_by_code` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `entry_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entry_id` int NOT NULL,
	`student_code` varchar(64) NOT NULL,
	`name_snapshot` varchar(191) NOT NULL,
	`class_level_snapshot` varchar(32) NOT NULL DEFAULT '',
	`class_room_snapshot` varchar(32) NOT NULL DEFAULT '',
	CONSTRAINT `entry_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entry_id` int NOT NULL,
	`criterion_id` int NOT NULL,
	`score` decimal(6,2) NOT NULL,
	`recorded_by` varchar(64) NOT NULL,
	`recorded_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scores_id` PRIMARY KEY(`id`),
	CONSTRAINT `score_entry_crit_uniq` UNIQUE(`entry_id`,`criterion_id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year_id` int NOT NULL,
	`max_entries_per_student` int NOT NULL DEFAULT 2,
	`registration_open` boolean NOT NULL DEFAULT false,
	`reg_start` datetime,
	`reg_end` datetime,
	`medal_gold_pct` int NOT NULL DEFAULT 80,
	`medal_silver_pct` int NOT NULL DEFAULT 70,
	`medal_bronze_pct` int NOT NULL DEFAULT 60,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subject_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year_id` int NOT NULL,
	`name` varchar(191) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `subject_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teacher_cache` (
	`teacher_code` varchar(64) NOT NULL,
	`data` text NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teacher_cache_teacher_code` PRIMARY KEY(`teacher_code`)
);
--> statement-breakpoint
CREATE TABLE `teacher_roles` (
	`teacher_code` varchar(64) NOT NULL,
	`name_snapshot` varchar(191) NOT NULL DEFAULT '',
	`is_admin` boolean NOT NULL DEFAULT false,
	`is_recorder` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teacher_roles_teacher_code` PRIMARY KEY(`teacher_code`)
);
--> statement-breakpoint
CREATE INDEX `cap_comp_idx` ON `competition_capacity` (`competition_id`);--> statement-breakpoint
CREATE INDEX `comp_year_idx` ON `competitions` (`year_id`);--> statement-breakpoint
CREATE INDEX `comp_group_idx` ON `competitions` (`subject_group_id`);--> statement-breakpoint
CREATE INDEX `crit_comp_idx` ON `criteria` (`competition_id`);--> statement-breakpoint
CREATE INDEX `entry_comp_idx` ON `entries` (`competition_id`);--> statement-breakpoint
CREATE INDEX `member_entry_idx` ON `entry_members` (`entry_id`);--> statement-breakpoint
CREATE INDEX `member_student_idx` ON `entry_members` (`student_code`);