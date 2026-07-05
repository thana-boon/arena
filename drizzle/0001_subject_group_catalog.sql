CREATE TABLE `subject_group_catalog` (
	`group_no` int NOT NULL,
	`name` varchar(191) NOT NULL DEFAULT '',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subject_group_catalog_group_no` PRIMARY KEY(`group_no`)
);
--> statement-breakpoint
ALTER TABLE `subject_groups` ADD `catalog_no` int;