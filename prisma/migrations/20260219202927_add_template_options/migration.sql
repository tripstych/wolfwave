-- AlterTable
ALTER TABLE `digital_downloads` ALTER COLUMN `expires_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `templates` ADD COLUMN `blueprint` JSON NULL,
    ADD COLUMN `default_content` JSON NULL,
    ADD COLUMN `options` JSON NULL;
