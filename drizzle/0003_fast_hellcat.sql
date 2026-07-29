CREATE TABLE `aiKnowledge` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`knowledgeType` varchar(32) NOT NULL,
	`symbol` varchar(32),
	`data` json,
	`source` varchar(32),
	`confidence` varchar(8),
	`relatedTradeId` int,
	`relatedStrategyId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiKnowledge_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`action` varchar(48) NOT NULL,
	`target` varchar(64),
	`detail` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `botLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`botRunId` int NOT NULL,
	`userId` int NOT NULL,
	`message` text NOT NULL,
	`level` enum('info','warn','error') NOT NULL DEFAULT 'info',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `botLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chatMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`chatId` varchar(64) NOT NULL DEFAULT 'main',
	`role` varchar(16) NOT NULL,
	`content` text NOT NULL,
	`steps` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ipWhitelist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ip` varchar(45) NOT NULL,
	`label` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ipWhitelist_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` varchar(64) NOT NULL,
	`payload` json,
	`status` enum('pending','done','failed') NOT NULL DEFAULT 'pending',
	`runAt` bigint NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `oauthAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`providerId` varchar(255) NOT NULL,
	`email` varchar(320),
	`name` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `oauthAccounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `passwordResetTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(96) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `passwordResetTokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plugin_installs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`pluginId` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`installed_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `plugin_installs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`author` varchar(128),
	`hook` varchar(64),
	`config` json,
	`enabled_by_default` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `plugins_id` PRIMARY KEY(`id`),
	CONSTRAINT `plugins_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `priceAlerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`direction` enum('above','below') NOT NULL,
	`targetPrice` decimal(18,8) NOT NULL,
	`status` enum('active','triggered','disabled') NOT NULL DEFAULT 'active',
	`triggeredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `priceAlerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`userAgent` text,
	`ip` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastActiveAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_sessionId_unique` UNIQUE(`sessionId`)
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`rule` json NOT NULL,
	`evidence` json NOT NULL,
	`patternType` varchar(32) NOT NULL,
	`sampleSize` int NOT NULL,
	`winRate` decimal(5,2) NOT NULL,
	`confidence` decimal(5,2) NOT NULL,
	`discoveredAt` bigint NOT NULL,
	`startEpoch` bigint NOT NULL,
	`endEpoch` bigint NOT NULL,
	`source` varchar(16) NOT NULL DEFAULT 'watch',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tickHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`price` decimal(18,8) NOT NULL,
	`lastDigit` int NOT NULL,
	`epoch` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tickHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userMemory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`memory` json NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userMemory_id` PRIMARY KEY(`id`),
	CONSTRAINT `userMemory_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `verificationTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(96) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `verificationTokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`url` varchar(512) NOT NULL,
	`events` json NOT NULL,
	`label` varchar(64),
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhooks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `notificationSettings` ADD `emailEnabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `trades` ADD `result` varchar(16);--> statement-breakpoint
ALTER TABLE `trades` ADD `contractId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerified` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `twoFASecret` text;--> statement-breakpoint
ALTER TABLE `users` ADD `twoFactorEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `avatarUrl` text;--> statement-breakpoint
ALTER TABLE `aiKnowledge` ADD CONSTRAINT `aiKnowledge_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditLogs` ADD CONSTRAINT `auditLogs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `botLogs` ADD CONSTRAINT `botLogs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chatMessages` ADD CONSTRAINT `chatMessages_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ipWhitelist` ADD CONSTRAINT `ipWhitelist_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `oauthAccounts` ADD CONSTRAINT `oauthAccounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `passwordResetTokens` ADD CONSTRAINT `passwordResetTokens_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `plugin_installs` ADD CONSTRAINT `plugin_installs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `priceAlerts` ADD CONSTRAINT `priceAlerts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signals` ADD CONSTRAINT `signals_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userMemory` ADD CONSTRAINT `userMemory_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `verificationTokens` ADD CONSTRAINT `verificationTokens_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `webhooks` ADD CONSTRAINT `webhooks_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `botRuns` ADD CONSTRAINT `botRuns_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `derivTokens` ADD CONSTRAINT `derivTokens_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notificationSettings` ADD CONSTRAINT `notificationSettings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `strategies` ADD CONSTRAINT `strategies_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `telegramSettings` ADD CONSTRAINT `telegramSettings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trades` ADD CONSTRAINT `trades_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `derivTokens` DROP COLUMN `published`;