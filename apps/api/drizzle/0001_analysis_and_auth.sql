CREATE TABLE `anomaly_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`anomaly_id` text NOT NULL,
	`status` text NOT NULL,
	`note` text,
	`user_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`anomaly_id`) REFERENCES `anomalies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `anomaly_actions_anomaly_idx` ON `anomaly_actions` (`anomaly_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_anomalies` (
	`id` text PRIMARY KEY NOT NULL,
	`finding_key` text NOT NULL,
	`analysis_run_id` text NOT NULL,
	`meter_id` text NOT NULL,
	`detected_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`window_start` text NOT NULL,
	`window_end` text,
	`type` text NOT NULL,
	`severity` text NOT NULL,
	`confidence` real NOT NULL,
	`priority_score` real NOT NULL,
	`reason` text NOT NULL,
	`recommended_action` text NOT NULL,
	`explanation` text NOT NULL,
	`steps` text NOT NULL,
	`insight_source` text NOT NULL,
	`insight_model` text,
	`insight_fallback_reason` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`related_event_id` integer,
	`evidence` text NOT NULL,
	FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`meter_id`) REFERENCES `meters`(`meter_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Editado a mano: drizzle-kit copiaba las filas con columnas que la tabla anterior no tenía.
-- La tabla anomalies estaba vacía (nada escribía en ella antes de esta migración), así que no se copia nada.
DROP TABLE `anomalies`;--> statement-breakpoint
ALTER TABLE `__new_anomalies` RENAME TO `anomalies`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `anomalies_finding_key_uq` ON `anomalies` (`finding_key`);--> statement-breakpoint
CREATE INDEX `anomalies_meter_idx` ON `anomalies` (`meter_id`);--> statement-breakpoint
CREATE INDEX `anomalies_run_idx` ON `anomalies` (`analysis_run_id`);--> statement-breakpoint
ALTER TABLE `analysis_runs` ADD `meter_summaries` text;