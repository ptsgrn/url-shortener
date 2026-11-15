CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`list` text NOT NULL,
	`type` text DEFAULT 'domain' NOT NULL,
	`pattern` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rules_type_pattern_list_unique` ON `rules` (`type`,`pattern`,`list`);--> statement-breakpoint
CREATE TABLE `rules_version` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer NOT NULL
);
