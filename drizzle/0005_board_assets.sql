CREATE TABLE `board_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`diagram_id` text NOT NULL,
	`mime` text NOT NULL,
	`data` blob NOT NULL,
	`bytes` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`diagram_id`) REFERENCES `diagrams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_asset_diagram` ON `board_assets` (`diagram_id`);