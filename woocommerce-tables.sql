-- WooCommerce API Keys
CREATE TABLE IF NOT EXISTS woocommerce_api_keys (
  key_id BIGINT(20) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT(20) UNSIGNED NOT NULL,
  description LONGTEXT,
  permissions VARCHAR(10) NOT NULL,
  consumer_key VARCHAR(128) NOT NULL,
  consumer_secret VARCHAR(128) NOT NULL,
  nonces LONGTEXT,
  truncated_key CHAR(7) NOT NULL,
  last_access DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY consumer_key (consumer_key),
  KEY consumer_secret (consumer_secret),
  KEY user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WooCommerce Sessions
CREATE TABLE IF NOT EXISTS woocommerce_sessions (
  session_id BIGINT(20) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_key CHAR(32) NOT NULL,
  session_value LONGTEXT NOT NULL,
  session_expiry BIGINT(20) UNSIGNED NOT NULL,
  UNIQUE KEY session_key (session_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WooCommerce Order Items
CREATE TABLE IF NOT EXISTS woocommerce_order_items (
  order_item_id BIGINT(20) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_item_name LONGTEXT NOT NULL,
  order_item_type VARCHAR(200) NOT NULL DEFAULT '',
  order_id BIGINT(20) UNSIGNED NOT NULL,
  KEY order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WooCommerce Order Item Meta
CREATE TABLE IF NOT EXISTS woocommerce_order_itemmeta (
  meta_id BIGINT(20) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_item_id BIGINT(20) UNSIGNED NOT NULL,
  meta_key VARCHAR(255) DEFAULT NULL,
  meta_value LONGTEXT,
  KEY order_item_id (order_item_id),
  KEY meta_key (meta_key(32))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WooCommerce Webhooks
CREATE TABLE IF NOT EXISTS wc_webhooks (
  webhook_id BIGINT(20) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  status VARCHAR(200) NOT NULL,
  name TEXT NOT NULL,
  user_id BIGINT(20) UNSIGNED NOT NULL,
  delivery_url TEXT NOT NULL,
  secret TEXT NOT NULL,
  topic VARCHAR(200) NOT NULL,
  date_created DATETIME DEFAULT NULL,
  date_created_gmt DATETIME DEFAULT NULL,
  date_modified DATETIME DEFAULT NULL,
  date_modified_gmt DATETIME DEFAULT NULL,
  api_version SMALLINT(4) NOT NULL,
  failure_count SMALLINT(10) NOT NULL DEFAULT 0,
  pending_delivery TINYINT(1) NOT NULL DEFAULT 0,
  KEY user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WooCommerce Product Meta Lookup
CREATE TABLE IF NOT EXISTS wc_product_meta_lookup (
  product_id BIGINT(20) NOT NULL,
  sku VARCHAR(100) DEFAULT '',
  `virtual` TINYINT(1) DEFAULT 0,
  downloadable TINYINT(1) DEFAULT 0,
  min_price DECIMAL(19,4) DEFAULT NULL,
  max_price DECIMAL(19,4) DEFAULT NULL,
  onsale TINYINT(1) DEFAULT 0,
  stock_quantity DOUBLE DEFAULT NULL,
  stock_status VARCHAR(100) DEFAULT 'instock',
  rating_count BIGINT(20) DEFAULT 0,
  average_rating DECIMAL(3,2) DEFAULT 0.00,
  total_sales BIGINT(20) DEFAULT 0,
  tax_status VARCHAR(100) DEFAULT 'taxable',
  tax_class VARCHAR(100) DEFAULT '',
  PRIMARY KEY (product_id),
  KEY `virtual` (`virtual`),
  KEY downloadable (downloadable),
  KEY stock_status (stock_status),
  KEY stock_quantity (stock_quantity),
  KEY onsale (onsale),
  KEY min_price (min_price),
  KEY max_price (max_price),
  KEY sku (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WordPress Posts
CREATE TABLE IF NOT EXISTS wp_posts (
  ID BIGINT(20) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_author BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
  post_date DATETIME DEFAULT NULL,
  post_date_gmt DATETIME DEFAULT NULL,
  post_content LONGTEXT NOT NULL,
  post_title TEXT NOT NULL,
  post_excerpt TEXT NOT NULL,
  post_status VARCHAR(20) NOT NULL DEFAULT 'publish',
  comment_status VARCHAR(20) NOT NULL DEFAULT 'open',
  ping_status VARCHAR(20) NOT NULL DEFAULT 'open',
  post_password VARCHAR(255) NOT NULL DEFAULT '',
  post_name VARCHAR(200) NOT NULL DEFAULT '',
  to_ping TEXT NOT NULL,
  pinged TEXT NOT NULL,
  post_modified DATETIME DEFAULT NULL,
  post_modified_gmt DATETIME DEFAULT NULL,
  post_content_filtered LONGTEXT NOT NULL,
  post_parent BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
  guid VARCHAR(255) NOT NULL DEFAULT '',
  menu_order INT(11) NOT NULL DEFAULT 0,
  post_type VARCHAR(20) NOT NULL DEFAULT 'post',
  post_mime_type VARCHAR(100) NOT NULL DEFAULT '',
  comment_count BIGINT(20) NOT NULL DEFAULT 0,
  KEY post_name (post_name(191)),
  KEY type_status_date (post_type, post_status, post_date, ID),
  KEY post_parent (post_parent),
  KEY post_author (post_author)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WordPress Post Meta
CREATE TABLE IF NOT EXISTS wp_postmeta (
  meta_id BIGINT(20) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
  meta_key VARCHAR(255) DEFAULT NULL,
  meta_value LONGTEXT,
  KEY post_id (post_id),
  KEY meta_key (meta_key(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WordPress Users
CREATE TABLE IF NOT EXISTS wp_users (
  ID BIGINT(20) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_login VARCHAR(60) NOT NULL DEFAULT '',
  user_pass VARCHAR(255) NOT NULL DEFAULT '',
  user_nicename VARCHAR(50) NOT NULL DEFAULT '',
  user_email VARCHAR(100) NOT NULL DEFAULT '',
  user_url VARCHAR(100) NOT NULL DEFAULT '',
  user_registered DATETIME DEFAULT NULL,
  user_activation_key VARCHAR(255) NOT NULL DEFAULT '',
  user_status INT(11) NOT NULL DEFAULT 0,
  display_name VARCHAR(250) NOT NULL DEFAULT '',
  KEY user_login_key (user_login),
  KEY user_nicename (user_nicename),
  KEY user_email (user_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WordPress User Meta
CREATE TABLE IF NOT EXISTS wp_usermeta (
  umeta_id BIGINT(20) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
  meta_key VARCHAR(255) DEFAULT NULL,
  meta_value LONGTEXT,
  KEY user_id (user_id),
  KEY meta_key (meta_key(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WooCommerce Tax Rates
CREATE TABLE IF NOT EXISTS woocommerce_tax_rates (
  tax_rate_id BIGINT(20) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tax_rate_country VARCHAR(2) NOT NULL DEFAULT '',
  tax_rate_state VARCHAR(200) NOT NULL DEFAULT '',
  tax_rate VARCHAR(8) NOT NULL DEFAULT '',
  tax_rate_name VARCHAR(200) NOT NULL DEFAULT '',
  tax_rate_priority BIGINT(20) UNSIGNED NOT NULL,
  tax_rate_compound INT(1) NOT NULL DEFAULT 0,
  tax_rate_shipping INT(1) NOT NULL DEFAULT 1,
  tax_rate_order BIGINT(20) UNSIGNED NOT NULL,
  tax_rate_class VARCHAR(200) NOT NULL DEFAULT '',
  KEY tax_rate_country (tax_rate_country),
  KEY tax_rate_state (tax_rate_state(2)),
  KEY tax_rate_class (tax_rate_class(10)),
  KEY tax_rate_priority (tax_rate_priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WooCommerce Shipping Zones
CREATE TABLE IF NOT EXISTS woocommerce_shipping_zones (
  zone_id BIGINT(20) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  zone_name VARCHAR(200) NOT NULL,
  zone_order BIGINT(20) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WooCommerce Shipping Zone Methods
CREATE TABLE IF NOT EXISTS woocommerce_shipping_zone_methods (
  zone_id BIGINT(20) UNSIGNED NOT NULL,
  instance_id BIGINT(20) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  method_id VARCHAR(200) NOT NULL,
  method_order BIGINT(20) UNSIGNED NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  KEY zone_id (zone_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sync Mapping Table
CREATE TABLE IF NOT EXISTS wc_wolfwave_sync (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  wolfwave_id INT NOT NULL,
  woocommerce_id BIGINT(20) NOT NULL,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  sync_direction VARCHAR(20) DEFAULT 'bidirectional',
  UNIQUE KEY unique_mapping (entity_type, wolfwave_id),
  KEY wc_id (woocommerce_id),
  KEY entity_type (entity_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
