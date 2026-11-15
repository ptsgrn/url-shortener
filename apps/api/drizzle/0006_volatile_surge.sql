CREATE TABLE `link_visits` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`visited_at` integer NOT NULL,
	`device` text,
	`browser` text,
	`referrer_host` text,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `link_visits_link_time_idx` ON `link_visits` (`link_id`,`visited_at`);