ALTER TABLE `users` DROP INDEX `users_openId_unique`;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `email` varchar(320) NOT NULL;--> statement-breakpoint
ALTER TABLE `derivTokens` ADD `published` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `strategies` ADD `published` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `trades` ADD `symbol` varchar(32) DEFAULT 'R_100' NOT NULL;--> statement-breakpoint
ALTER TABLE `trades` ADD `contractType` varchar(32) DEFAULT 'CALL';--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `trades` DROP COLUMN `result`;--> statement-breakpoint
ALTER TABLE `trades` DROP COLUMN `contractId`;--> statement-breakpoint
ALTER TABLE `trades` DROP COLUMN `createdAt`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `openId`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `loginMethod`;