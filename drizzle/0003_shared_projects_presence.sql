CREATE TABLE `board_presence` (
	`diagram_id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`selection` text DEFAULT '' NOT NULL,
	`last_seen` integer NOT NULL,
	FOREIGN KEY (`diagram_id`) REFERENCES `diagrams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_presence_session` ON `board_presence` (`diagram_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `idx_presence_seen` ON `board_presence` (`last_seen`);--> statement-breakpoint
CREATE TABLE `project_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project` text NOT NULL,
	`owner_name` text DEFAULT '' NOT NULL,
	`token_hash` text NOT NULL,
	`role` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_project_invite_token` ON `project_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_project_invite_project` ON `project_invites` (`owner`,`project`);--> statement-breakpoint
CREATE TABLE `project_members` (
	`owner` text NOT NULL,
	`project` text NOT NULL,
	`owner_name` text DEFAULT '' NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_project_member` ON `project_members` (`owner`,`project`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_project_member_user` ON `project_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_diagrams_project` ON `diagrams` (`owner`,`project`);