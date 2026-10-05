CREATE TABLE `google_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`google_sub` text NOT NULL,
	`google_email` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` text,
	`scope` text,
	`status` text DEFAULT 'active' NOT NULL,
	`connected_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
