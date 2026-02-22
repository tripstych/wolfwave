-- AlterTable
ALTER TABLE `menu_items` ADD COLUMN `description` VARCHAR(500) NULL,
    ADD COLUMN `image` VARCHAR(500) NULL,
    ADD COLUMN `is_mega` BOOLEAN NULL DEFAULT false,
    ADD COLUMN `mega_columns` INTEGER NULL DEFAULT 4,
    ADD COLUMN `css_class` VARCHAR(255) NULL;
