-- Add Shopify integration tables

-- Shopify configuration per site
CREATE TABLE IF NOT EXISTS `shopify_config` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `site_id` INT NOT NULL,
  `shop_domain` VARCHAR(255) NOT NULL,
  `access_token` TEXT NOT NULL,
  `api_version` VARCHAR(20) DEFAULT '2024-01',
  `storefront_access_token` TEXT,
  `sync_enabled` BOOLEAN DEFAULT true,
  `sync_frequency` VARCHAR(20) DEFAULT 'hourly',
  `last_sync_at` DATETIME,
  `webhook_secret` VARCHAR(255),
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_site_shopify` (`site_id`),
  CONSTRAINT `fk_shopify_config_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Shopify product sync tracking
CREATE TABLE IF NOT EXISTS `shopify_products` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `site_id` INT NOT NULL,
  `product_id` INT,
  `shopify_product_id` BIGINT NOT NULL,
  `shopify_handle` VARCHAR(255),
  `sync_status` ENUM('synced', 'pending', 'error', 'conflict') DEFAULT 'synced',
  `sync_direction` ENUM('shopify_to_cms', 'cms_to_shopify', 'bidirectional') DEFAULT 'bidirectional',
  `last_synced_at` DATETIME,
  `last_modified_source` ENUM('shopify', 'cms') DEFAULT 'shopify',
  `error_message` TEXT,
  `shopify_data` JSON,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_site_shopify_product` (`site_id`, `shopify_product_id`),
  KEY `idx_product_id` (`product_id`),
  KEY `idx_sync_status` (`sync_status`),
  CONSTRAINT `fk_shopify_products_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_shopify_products_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Shopify variant sync tracking
CREATE TABLE IF NOT EXISTS `shopify_variants` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `shopify_product_id` INT NOT NULL,
  `product_variant_id` INT,
  `shopify_variant_id` BIGINT NOT NULL,
  `shopify_sku` VARCHAR(255),
  `sync_status` ENUM('synced', 'pending', 'error') DEFAULT 'synced',
  `last_synced_at` DATETIME,
  `shopify_data` JSON,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_shopify_variant` (`shopify_product_id`, `shopify_variant_id`),
  KEY `idx_product_variant_id` (`product_variant_id`),
  CONSTRAINT `fk_shopify_variants_shopify_product` FOREIGN KEY (`shopify_product_id`) REFERENCES `shopify_products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Shopify order sync tracking
CREATE TABLE IF NOT EXISTS `shopify_orders` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `site_id` INT NOT NULL,
  `order_id` INT,
  `shopify_order_id` BIGINT NOT NULL,
  `shopify_order_number` VARCHAR(50),
  `sync_status` ENUM('synced', 'pending', 'error') DEFAULT 'synced',
  `last_synced_at` DATETIME,
  `shopify_data` JSON,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_site_shopify_order` (`site_id`, `shopify_order_id`),
  KEY `idx_order_id` (`order_id`),
  CONSTRAINT `fk_shopify_orders_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Shopify webhook log
CREATE TABLE IF NOT EXISTS `shopify_webhooks` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `site_id` INT NOT NULL,
  `topic` VARCHAR(100) NOT NULL,
  `shopify_webhook_id` BIGINT,
  `payload` JSON,
  `processed` BOOLEAN DEFAULT false,
  `processed_at` DATETIME,
  `error_message` TEXT,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_site_topic` (`site_id`, `topic`),
  KEY `idx_processed` (`processed`),
  CONSTRAINT `fk_shopify_webhooks_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Shopify sync log
CREATE TABLE IF NOT EXISTS `shopify_sync_log` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `site_id` INT NOT NULL,
  `sync_type` ENUM('products', 'orders', 'customers', 'inventory', 'full') NOT NULL,
  `sync_direction` ENUM('import', 'export', 'bidirectional') NOT NULL,
  `status` ENUM('running', 'completed', 'failed', 'partial') DEFAULT 'running',
  `items_total` INT DEFAULT 0,
  `items_processed` INT DEFAULT 0,
  `items_succeeded` INT DEFAULT 0,
  `items_failed` INT DEFAULT 0,
  `error_message` TEXT,
  `started_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `completed_at` DATETIME,
  PRIMARY KEY (`id`),
  KEY `idx_site_status` (`site_id`, `status`),
  KEY `idx_started_at` (`started_at`),
  CONSTRAINT `fk_shopify_sync_log_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
