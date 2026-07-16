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
  `createdAt` timestamp DEFAULT now() NOT NULL,
  CONSTRAINT `signals_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `signals_userId_idx` ON `signals` (`userId`);--> statement-breakpoint
CREATE INDEX `signals_symbol_idx` ON `signals` (`symbol`);