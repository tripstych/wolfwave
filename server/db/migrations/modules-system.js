/**
 * Module Management System Migration
 * 
 * Creates tables for managing modules (features/integrations) that can be
 * enabled/disabled per subscription plan or per individual customer.
 */

export const modulesSystemTables = [
  // Modules registry - defines all available modules in the system
  `CREATE TABLE IF NOT EXISTS modules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(50) DEFAULT 'integration',
    icon VARCHAR(50),
    is_system BOOLEAN DEFAULT FALSE,
    requires_config BOOLEAN DEFAULT FALSE,
    config_schema JSON,
    default_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_category (category)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Module availability per subscription plan
  `CREATE TABLE IF NOT EXISTS plan_modules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    plan_id INT NOT NULL,
    module_id INT NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    config JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    UNIQUE KEY unique_plan_module (plan_id, module_id),
    INDEX idx_plan (plan_id),
    INDEX idx_module (module_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Customer-specific module overrides
  `CREATE TABLE IF NOT EXISTS customer_modules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    module_id INT NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    config JSON,
    override_plan BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    UNIQUE KEY unique_customer_module (customer_id, module_id),
    INDEX idx_customer (customer_id),
    INDEX idx_module (module_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Module usage tracking for analytics and billing
  `CREATE TABLE IF NOT EXISTS module_usage (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    module_id INT NOT NULL,
    usage_type VARCHAR(50) NOT NULL,
    usage_count INT DEFAULT 1,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    INDEX idx_customer_module (customer_id, module_id),
    INDEX idx_created_at (created_at),
    INDEX idx_usage_type (usage_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Insert default modules
  `INSERT IGNORE INTO modules (name, description, category, icon, requires_config, default_enabled) VALUES
    ('ShipStation Integration', 'Connect to ShipStation for order fulfillment and shipping', 'shipping', 'package', true, false),
    ('WooCommerce API', 'WooCommerce REST API compatibility layer', 'integration', 'shopping-cart', true, false),
    ('Advanced Analytics', 'Detailed analytics and reporting dashboard', 'analytics', 'bar-chart', false, false),
    ('Email Marketing', 'Built-in email marketing campaigns', 'marketing', 'mail', true, false),
    ('Multi-Currency', 'Support for multiple currencies', 'ecommerce', 'dollar-sign', true, false),
    ('Subscriptions', 'Recurring billing and subscription management', 'ecommerce', 'repeat', false, true),
    ('Digital Downloads', 'Sell and deliver digital products', 'ecommerce', 'download', false, true),
    ('Classified Ads', 'User-generated classified advertisements', 'content', 'list', false, false),
    ('API Access', 'Full REST API access for integrations', 'developer', 'code', false, false),
    ('Custom Domains', 'Use your own domain name', 'infrastructure', 'globe', true, false),
    ('Priority Support', '24/7 priority customer support', 'support', 'headphones', false, false),
    ('White Label', 'Remove WolfWave branding', 'branding', 'eye-off', false, false)`
];

export default modulesSystemTables;
