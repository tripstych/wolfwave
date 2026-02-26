-- Create stylesheets table for database-backed CSS management

CREATE TABLE IF NOT EXISTS `stylesheets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `site_id` INT,
  `filename` VARCHAR(255) NOT NULL,
  `content` LONGTEXT NOT NULL,
  `description` TEXT,
  `type` ENUM('global', 'theme', 'template', 'component') DEFAULT 'template',
  `is_active` BOOLEAN DEFAULT true,
  `load_order` INT DEFAULT 100,
  `minified` BOOLEAN DEFAULT false,
  `source_file` VARCHAR(512),
  `last_synced_at` DATETIME,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` INT,
  `updated_by` INT,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_site_filename` (`site_id`, `filename`),
  KEY `idx_filename` (`filename`),
  KEY `idx_type` (`type`),
  KEY `idx_active` (`is_active`),
  KEY `idx_load_order` (`load_order`),
  CONSTRAINT `fk_stylesheets_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stylesheets_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_stylesheets_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create index for fast lookups by site and filename
CREATE INDEX `idx_site_filename_active` ON `stylesheets` (`site_id`, `filename`, `is_active`);

-- Insert default stylesheets from templates/css directory
-- These will be synced from filesystem on first run
INSERT INTO `stylesheets` (`site_id`, `filename`, `content`, `description`, `type`, `source_file`) 
VALUES 
  (NULL, 'classifieds.css', '/* Placeholder - sync from filesystem */', 'Classifieds listing styles', 'template', 'templates/css/classifieds.css'),
  (NULL, 'emails.css', '/* Placeholder - sync from filesystem */', 'Email template styles', 'template', 'templates/css/emails.css')
ON DUPLICATE KEY UPDATE `updated_at` = CURRENT_TIMESTAMP;
