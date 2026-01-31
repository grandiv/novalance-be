-- NovaLance D1 Database Schema
-- Fresh schema for Cloudflare D1

-- Users table
CREATE TABLE IF NOT EXISTS `users` (
	`address` text PRIMARY KEY NOT NULL,
	`nonce` text NOT NULL DEFAULT (lower(hex(randomblob(16)))),
	`email` text,
	`github_url` text,
	`linkedin_url` text,
	`bio` text,
	`created_at` integer NOT NULL DEFAULT (strftime('%s', 'now')),
	`updated_at` integer NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Projects table
CREATE TABLE IF NOT EXISTS `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_address` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`timeline_start` integer NOT NULL,
	`timeline_end` integer NOT NULL,
	`status` text NOT NULL DEFAULT 'draft',
	`vault_address` text,
	`total_deposited` text DEFAULT '0',
	`po_response_deadline` integer,
	`created_at` integer NOT NULL DEFAULT (strftime('%s', 'now')),
	`updated_at` integer NOT NULL DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`owner_address`) REFERENCES `users`(`address`) ON UPDATE no action ON DELETE cascade
);

-- Project Roles table
CREATE TABLE IF NOT EXISTS `project_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`kpi_count` integer NOT NULL,
	`payment_per_kpi` text NOT NULL,
	`status` text NOT NULL DEFAULT 'open',
	`skills` text,
	`created_at` integer NOT NULL DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Applications table
CREATE TABLE IF NOT EXISTS `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`project_role_id` text NOT NULL,
	`freelancer_address` text NOT NULL,
	`status` text NOT NULL DEFAULT 'pending',
	`cover_letter` text,
	`created_at` integer NOT NULL DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`project_role_id`) REFERENCES `project_roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`freelancer_address`) REFERENCES `users`(`address`) ON UPDATE no action ON DELETE cascade
);

-- Assignments table
CREATE TABLE IF NOT EXISTS `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_role_id` text NOT NULL,
	`freelancer_address` text NOT NULL,
	`assigned_at` integer NOT NULL DEFAULT (strftime('%s', 'now')),
	`status` text NOT NULL DEFAULT 'active',
	FOREIGN KEY (`project_role_id`) REFERENCES `project_roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`freelancer_address`) REFERENCES `users`(`address`) ON UPDATE no action ON DELETE cascade
);

-- KPIs table
CREATE TABLE IF NOT EXISTS `kpis` (
	`id` text PRIMARY KEY NOT NULL,
	`project_role_id` text NOT NULL,
	`assignment_id` text,
	`kpi_number` integer NOT NULL,
	`description` text NOT NULL,
	`deadline` integer NOT NULL,
	`amount` text NOT NULL,
	`status` text NOT NULL DEFAULT 'pending',
	`submitted_at` integer,
	`reviewed_at` integer,
	`submission_data` text,
	`review_comment` text,
	`penalty_amount` text DEFAULT '0',
	`deposit_tx_hash` text,
	`payout_tx_hash` text,
	`vault_balance_at_start` text,
	`vault_balance_at_end` text,
	`yield_earned` text DEFAULT '0',
	`created_at` integer NOT NULL DEFAULT (strftime('%s', 'now')),
	`updated_at` integer NOT NULL DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`project_role_id`) REFERENCES `project_roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE set null
);

-- Transactions table
CREATE TABLE IF NOT EXISTS `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`project_id` text,
	`kpi_id` text,
	`assignment_id` text,
	`tx_hash` text NOT NULL,
	`amount` text NOT NULL,
	`status` text NOT NULL DEFAULT 'pending',
	`created_at` integer NOT NULL DEFAULT (strftime('%s', 'now')),
	`confirmed_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`kpi_id`) REFERENCES `kpis`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE set null
);
