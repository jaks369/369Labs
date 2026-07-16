CREATE TABLE `tickHistory` (
  `id` int AUTO_INCREMENT NOT NULL,
  `symbol` varchar(32) NOT NULL,
  `price` decimal(18,8) NOT NULL,
  `lastDigit` int NOT NULL,
  `epoch` bigint NOT NULL,
  `createdAt` timestamp DEFAULT now() NOT NULL,
  CONSTRAINT `tickHistory_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `tickHistory_symbol_idx` ON `tickHistory` (`symbol`);--> statement-breakpoint
CREATE INDEX `tickHistory_epoch_idx` ON `tickHistory` (`epoch`);