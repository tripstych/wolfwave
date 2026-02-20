-- AlterTable
ALTER TABLE `digital_downloads` ALTER COLUMN `expires_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `menu_items` ADD COLUMN `display_rules` JSON NULL;

-- AlterTable
ALTER TABLE `menus` ADD COLUMN `display_rules` JSON NULL;
