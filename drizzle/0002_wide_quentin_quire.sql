CREATE TABLE `improvement_points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`writingReviewId` int,
	`content` varchar(500) NOT NULL,
	`status` enum('pending','experimenting','completed','dropped') NOT NULL DEFAULT 'pending',
	`experimentNotes` text,
	`isCurrentExperiment` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `improvement_points_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `weekly_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`weekStart` varchar(10) NOT NULL,
	`weekEnd` varchar(10) NOT NULL,
	`energyAvg` varchar(4),
	`energyLowDay` varchar(10),
	`energyHighDay` varchar(10),
	`habitSummary` json DEFAULT ('[]'),
	`drainKeywords` json DEFAULT ('[]'),
	`chargeKeywords` json DEFAULT ('[]'),
	`aiAnalysis` text,
	`nextWeekMode` enum('recovery','normal','stretch'),
	`suggestions` json DEFAULT ('[]'),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weekly_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `writing_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`freewriting` text,
	`conversation` json DEFAULT ('[]'),
	`emotionKeywords` json DEFAULT ('[]'),
	`insights` text,
	`improvementPoints` json DEFAULT ('[]'),
	`tags` json DEFAULT ('[]'),
	`status` enum('draft','chatting','completed') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `writing_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `daily_entries` MODIFY COLUMN `date` varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE `habit_logs` MODIFY COLUMN `date` varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE `todos` MODIFY COLUMN `date` varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE `improvement_points` ADD CONSTRAINT `improvement_points_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `improvement_points` ADD CONSTRAINT `improvement_points_writingReviewId_writing_reviews_id_fk` FOREIGN KEY (`writingReviewId`) REFERENCES `writing_reviews`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weekly_reviews` ADD CONSTRAINT `weekly_reviews_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `writing_reviews` ADD CONSTRAINT `writing_reviews_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;