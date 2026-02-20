-- AlterTable
ALTER TABLE `digital_downloads` ALTER COLUMN `expires_at` DROP DEFAULT;

-- CreateTable
CREATE TABLE `imported_sites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `root_url` VARCHAR(255) NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `page_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `imported_pages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `site_id` INTEGER NOT NULL,
    `url` VARCHAR(255) NOT NULL,
    `title` VARCHAR(255) NULL,
    `raw_html` LONGTEXT NULL,
    `structural_hash` VARCHAR(64) NULL,
    `metadata` JSON NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_site_id`(`site_id`),
    INDEX `idx_structural_hash`(`structural_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `imported_pages` ADD CONSTRAINT `imported_pages_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `imported_sites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
