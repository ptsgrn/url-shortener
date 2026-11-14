ALTER TABLE `users` ADD `role` text;--> statement-breakpoint
ALTER TABLE `users` ADD `banned_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `banned_reason` text;--> statement-breakpoint
ALTER TABLE `users` ADD `updated_at` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `links` ADD `deactivated_at` text;--> statement-breakpoint
ALTER TABLE `links` ADD `deactivated_reason` text;--> statement-breakpoint
ALTER TABLE `links` ADD `updated_at` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `links` ADD `deleted_at` integer;