-- Migration: Add Amazon SP-API + Classifieds tables
-- Run this on your production database if `prisma db push` isn't an option

-- Amazon: Add columns to products table (skip if already exist)
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'amazon_asin');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `products` ADD COLUMN `amazon_asin` VARCHAR(20) NULL, ADD COLUMN `amazon_fnsku` VARCHAR(20) NULL, ADD INDEX `idx_amazon_asin` (`amazon_asin`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Amazon: Order sync table
CREATE TABLE IF NOT EXISTS `amazon_order_sync` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `amazon_order_id` VARCHAR(50) NOT NULL,
    `order_id` INTEGER NULL,
    `status` VARCHAR(30) NOT NULL,
    `data` JSON NULL,
    `synced_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    UNIQUE INDEX `amazon_order_id`(`amazon_order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Classifieds: Categories
CREATE TABLE IF NOT EXISTS `classified_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `parent_id` INTEGER NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    UNIQUE INDEX `slug_cc`(`slug`),
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_cc_parent` FOREIGN KEY (`parent_id`) REFERENCES `classified_categories`(`id`) ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Classifieds: Ads
CREATE TABLE IF NOT EXISTS `classified_ads` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `template_id` INTEGER NULL,
    `content_id` INTEGER NULL,
    `category_id` INTEGER NULL,
    `title` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `price` DECIMAL(10, 2) NULL,
    `currency` VARCHAR(10) NULL DEFAULT 'USD',
    `condition` ENUM('new_item', 'used', 'refurbished', 'na') NULL DEFAULT 'na',
    `location` VARCHAR(255) NULL,
    `contact_info` VARCHAR(500) NULL,
    `images` JSON NULL,
    `status` ENUM('pending_review', 'approved', 'rejected', 'expired', 'sold') NOT NULL DEFAULT 'pending_review',
    `rejection_reason` TEXT NULL,
    `moderation_flags` JSON NULL,
    `expires_at` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    UNIQUE INDEX `slug_ca`(`slug`),
    INDEX `idx_ca_customer`(`customer_id`),
    INDEX `idx_ca_status`(`status`),
    INDEX `idx_ca_category`(`category_id`),
    INDEX `idx_ca_expires`(`expires_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_ca_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ca_category` FOREIGN KEY (`category_id`) REFERENCES `classified_categories`(`id`) ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Classifieds: Moderation rules
CREATE TABLE IF NOT EXISTS `classified_moderation_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `rule_type` VARCHAR(10) NOT NULL,
    `description` TEXT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
