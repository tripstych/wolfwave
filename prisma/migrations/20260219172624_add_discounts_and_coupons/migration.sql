-- AlterTable
ALTER TABLE `digital_downloads` ALTER COLUMN `expires_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `coupon_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `subscription_plans` ADD COLUMN `product_discount` DECIMAL(5, 2) NULL DEFAULT 0.00;

-- CreateTable
CREATE TABLE `coupons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(50) NOT NULL,
    `discount_type` VARCHAR(20) NOT NULL,
    `discount_value` DECIMAL(10, 2) NOT NULL,
    `min_purchase` DECIMAL(10, 2) NULL DEFAULT 0.00,
    `starts_at` TIMESTAMP(0) NULL,
    `expires_at` TIMESTAMP(0) NULL,
    `max_uses` INTEGER NULL,
    `used_count` INTEGER NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `code`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `idx_coupon_id` ON `orders`(`coupon_id`);

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
