-- AlterTable
ALTER TABLE `coupons` ADD COLUMN `target_slugs` JSON NULL;

-- AlterTable
ALTER TABLE `digital_downloads` ALTER COLUMN `expires_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `subscription_plans` ADD COLUMN `target_slugs` JSON NULL;
