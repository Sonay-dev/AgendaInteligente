CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`status` text DEFAULT 'pendente' NOT NULL,
	`priority` integer DEFAULT 3 NOT NULL,
	`tag` text,
	`category_id` text,
	`is_archived` integer DEFAULT 0 NOT NULL,
	`is_pinned` integer DEFAULT 0 NOT NULL,
	`checklist` text,
	`reminder_at` text,
	`completed_at` text,
	`archived_at` text,
	`color` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notes_user_status` ON `notes` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `notes_user_archived` ON `notes` (`user_id`,`is_archived`);--> statement-breakpoint
CREATE INDEX `notes_user_priority` ON `notes` (`user_id`,`priority`);

