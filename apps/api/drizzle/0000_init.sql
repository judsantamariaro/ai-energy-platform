CREATE TABLE `analysis_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`stages` text NOT NULL,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`summary` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `anomalies` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_run_id` text NOT NULL,
	`meter_id` text NOT NULL,
	`detected_at` text NOT NULL,
	`window_start` text NOT NULL,
	`window_end` text,
	`type` text NOT NULL,
	`severity` text NOT NULL,
	`confidence` real NOT NULL,
	`priority_score` real NOT NULL,
	`reason` text NOT NULL,
	`recommended_action` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`related_event_id` integer,
	`evidence` text NOT NULL,
	FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meter_id`) REFERENCES `meters`(`meter_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `anomalies_meter_idx` ON `anomalies` (`meter_id`);--> statement-breakpoint
CREATE INDEX `anomalies_run_idx` ON `anomalies` (`analysis_run_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meter_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`type` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`meter_id`) REFERENCES `meters`(`meter_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_meter_ts_type_uq` ON `events` (`meter_id`,`timestamp`,`type`);--> statement-breakpoint
CREATE TABLE `meters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meter_id` text NOT NULL,
	`name` text NOT NULL,
	`location` text,
	`status` text DEFAULT 'OK' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meters_meter_id_unique` ON `meters` (`meter_id`);--> statement-breakpoint
CREATE TABLE `readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meter_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`consumption_kwh` real,
	`voltage_v` real,
	`current_a` real,
	`power_factor` real,
	`status` text,
	FOREIGN KEY (`meter_id`) REFERENCES `meters`(`meter_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `readings_meter_ts_uq` ON `readings` (`meter_id`,`timestamp`);