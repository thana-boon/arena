CREATE TABLE `time_slots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year_id` int NOT NULL,
	`label` varchar(191) NOT NULL,
	`start_time` time NOT NULL,
	`end_time` time NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `time_slots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `competitions` ADD `time_slot_id` int;--> statement-breakpoint
CREATE INDEX `slot_year_idx` ON `time_slots` (`year_id`);