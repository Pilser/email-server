--> statement-breakpoint
ALTER TABLE `domain` ADD `owner_id` text REFERENCES `user`(`id`);
--> statement-breakpoint
CREATE INDEX `idx_domain_owner` ON `domain` (`owner_id`);
