CREATE TABLE `diagram_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`diagram_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`role` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`diagram_id`) REFERENCES `diagrams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invite_token` ON `diagram_invites` (`token_hash`);--> statement-breakpoint
CREATE TABLE `diagram_members` (
	`diagram_id` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`diagram_id`) REFERENCES `diagrams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_diagram_member` ON `diagram_members` (`diagram_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_member_user` ON `diagram_members` (`user_id`);