-- Create a test order for ShipStation validation
-- This inserts a complete order with customer, address, and line items

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
  total_amount,
  subtotal,
  tax_amount,
  shipping_amount,
  currency,
  shipping_address_id,
  billing_address_id,
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
  'USD',
  @address_id,
  @address_id,
  NOW(),
  NOW()
);

SET @order_id = LAST_INSERT_ID();

-- Insert order line item
INSERT INTO order_items (
  order_id,
  product_id,
  product_name,
  quantity,
  price,
  total,
  created_at
) VALUES (
  @order_id,
  1,
  'Test Product for ShipStation',
  1,
  24.99,
  24.99,
  NOW()
);

-- Display the created order
SELECT 
  o.id,
  o.order_number,
  o.status,
  o.total_amount,
  c.email,
  CONCAT(c.first_name, ' ', c.last_name) as customer_name,
  a.address1,
  a.city,
  a.province,
  a.postal_code,
  a.country
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN addresses a ON o.shipping_address_id = a.id
WHERE o.id = @order_id;
