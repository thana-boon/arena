CREATE TABLE `venues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`building` varchar(191) NOT NULL DEFAULT '',
	`note` varchar(255) NOT NULL DEFAULT '',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `venues_id` PRIMARY KEY(`id`),
	CONSTRAINT `venues_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `competitions` ADD `venue_id` int;