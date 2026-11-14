PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_links` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`url` text NOT NULL,
	`user_id` text,
	`deactivated_at` integer,
	`deactivated_reason` text,
	`banned_at` integer,
	`banned_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_links`("id", "code", "url", "user_id", "deactivated_at", "deactivated_reason", "banned_at", "banned_reason", "created_at", "updated_at", "deleted_at") SELECT "id", "code", "url", "user_id", "deactivated_at", "deactivated_reason", NULL, NULL, "created_at", "updated_at", "deleted_at" FROM `links`;--> statement-breakpoint
DROP TABLE `links`;--> statement-breakpoint
ALTER TABLE `__new_links` RENAME TO `links`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `links_code_unique` ON `links` (`code`);