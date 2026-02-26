-- Create a test order for ShipStation validation
-- This inserts a complete order with customer, address, and line items

-- Clean up any existing test data
DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'TEST-%');
DELETE FROM orders WHERE order_number LIKE 'TEST-%';
DELETE FROM addresses WHERE customer_id IN (SELECT id FROM customers WHERE email = 'test@shipstation.local');
DELETE FROM customers WHERE email = 'test@shipstation.local';

-- Insert test customer
INSERT INTO customers (email, first_name, last_name, created_at, updated_at)
VALUES ('test@shipstation.local', 'Test', 'Customer', NOW(), NOW());

SET @customer_id = LAST_INSERT_ID();

-- Insert shipping address
INSERT INTO addresses (customer_id, type, first_name, last_name, address1, city, province, postal_code, country, is_default, created_at)
VALUES (@customer_id, 'shipping', 'Test', 'Customer', '123 Test St', 'Test City', 'CA', '90210', 'US', 1, NOW());

SET @address_id = LAST_INSERT_ID();

-- Insert test order
INSERT INTO orders (
  customer_id,
  order_number,
  status,
  payment_status,
  total,
  subtotal,
  tax,
  shipping,
  discount,
  email,
  billing_address,
  shipping_address,
  payment_method,
  created_at,
  updated_at
) VALUES (
  @customer_id,
  CONCAT('TEST-', UNIX_TIMESTAMP()),
  'processing',
  'paid',
  29.99,
  24.99,
  2.00,
  3.00,
  0.00,
  'test@shipstation.local',
  JSON_OBJECT('first_name', 'Test', 'last_name', 'Customer', 'address1', '123 Test St', 'city', 'Test City', 'province', 'CA', 'postal_code', '90210', 'country', 'US'),
  JSON_OBJECT('first_name', 'Test', 'last_name', 'Customer', 'address1', '123 Test St', 'city', 'Test City', 'province', 'CA', 'postal_code', '90210', 'country', 'US'),
  'stripe',
  NOW(),
  NOW()
);

SET @order_id = LAST_INSERT_ID();

-- Insert order line item
INSERT INTO order_items (
  order_id,
  product_id,
  variant_id,
  product_title,
  variant_title,
  sku,
  price,
  quantity,
  subtotal,
  created_at
) VALUES (
  @order_id,
  1,
  NULL,
  'Test Product for ShipStation',
  NULL,
  'TEST-SKU-001',
  24.99,
  1,
  24.99,
  NOW()
);

-- Display the created order
SELECT 
  o.id,
  o.order_number,
  o.status,
  o.total,
  o.email,
  CONCAT(c.first_name, ' ', c.last_name) as customer_name,
  o.shipping_address
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE o.id = @order_id;
