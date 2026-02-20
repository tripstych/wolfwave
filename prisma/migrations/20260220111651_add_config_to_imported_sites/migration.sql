-- AlterTable
ALTER TABLE `digital_downloads` ALTER COLUMN `expires_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `imported_sites` ADD COLUMN `config` JSON NULL;
