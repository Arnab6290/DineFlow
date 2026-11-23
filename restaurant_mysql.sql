-- =====================================================
-- Restaurant Billing Database (MySQL 8.0+)
-- Run this whole file in MySQL Workbench or the mysql client.
-- =====================================================

CREATE DATABASE IF NOT EXISTS restaurant_db;
USE restaurant_db;

-- -----------------------------------------------------
-- 1. TABLES
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_items (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_name    VARCHAR(100) NOT NULL UNIQUE,
  category     VARCHAR(50),
  price        DECIMAL(10,2) NOT NULL CHECK (price > 0),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  table_number INT NOT NULL UNIQUE CHECK (table_number > 0),
  table_status ENUM('available','occupied') NOT NULL DEFAULT 'available'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  table_id     BIGINT NOT NULL,
  order_status ENUM('open','closed','cancelled') NOT NULL DEFAULT 'open',
  ordered_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (table_id) REFERENCES restaurant_tables(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id     BIGINT NOT NULL,
  menu_item_id BIGINT NOT NULL,
  quantity     INT NOT NULL CHECK (quantity > 0),
  unit_price   DECIMAL(10,2) NOT NULL DEFAULT 0,   -- filled automatically by trigger
  line_total   DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  FOREIGN KEY (order_id)     REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bills (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id     BIGINT NOT NULL UNIQUE,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  bill_status  ENUM('open','paid') NOT NULL DEFAULT 'open',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at    DATETIME NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Indexes (foreign keys already create indexes in MySQL, so only this one is needed)
CREATE INDEX idx_bills_status ON bills(bill_status);

-- -----------------------------------------------------
-- 2. PROCEDURE + TRIGGERS
-- -----------------------------------------------------
DELIMITER $$

-- Recalculate the total of an open bill (reused by 3 triggers below)
CREATE PROCEDURE refresh_bill_total(IN p_order_id BIGINT)
BEGIN
  UPDATE bills
  SET total_amount = (SELECT IFNULL(SUM(line_total), 0)
                      FROM order_items
                      WHERE order_id = p_order_id)
  WHERE order_id = p_order_id AND bill_status = 'open';
END$$

-- Before creating an order: the table must be available
CREATE TRIGGER trg_check_table_before_order
BEFORE INSERT ON orders
FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20);

  SELECT table_status INTO v_status
  FROM restaurant_tables
  WHERE id = NEW.table_id;

  IF v_status IS NULL OR v_status <> 'available' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This restaurant table is not available.';
  END IF;
END$$

-- After creating an order: occupy the table and create its bill
CREATE TRIGGER trg_prepare_new_order
AFTER INSERT ON orders
FOR EACH ROW
BEGIN
  UPDATE restaurant_tables SET table_status = 'occupied' WHERE id = NEW.table_id;
  INSERT INTO bills (order_id) VALUES (NEW.id);
END$$

-- Before adding an item: copy the current menu price
CREATE TRIGGER trg_copy_menu_price
BEFORE INSERT ON order_items
FOR EACH ROW
BEGIN
  DECLARE v_price DECIMAL(10,2);
  DECLARE v_order_status VARCHAR(20);

  SELECT order_status INTO v_order_status FROM orders WHERE id = NEW.order_id;
  IF v_order_status IS NULL OR v_order_status <> 'open' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This order is not open.';
  END IF;

  SELECT price INTO v_price
  FROM menu_items
  WHERE id = NEW.menu_item_id AND is_available = TRUE;

  IF v_price IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Menu item does not exist or is unavailable.';
  END IF;

  SET NEW.unit_price = v_price;
END$$

-- Keep the bill total correct after insert / update / delete
CREATE TRIGGER trg_bill_total_insert
AFTER INSERT ON order_items
FOR EACH ROW
BEGIN
  CALL refresh_bill_total(NEW.order_id);
END$$

CREATE TRIGGER trg_bill_total_update
AFTER UPDATE ON order_items
FOR EACH ROW
BEGIN
  CALL refresh_bill_total(NEW.order_id);
END$$

CREATE TRIGGER trg_bill_total_delete
AFTER DELETE ON order_items
FOR EACH ROW
BEGIN
  CALL refresh_bill_total(OLD.order_id);
END$$

-- Close a bill and free the table (one transaction: all or nothing)
CREATE PROCEDURE close_bill(IN p_order_id BIGINT)
BEGIN
  DECLARE v_table_id BIGINT;
  DECLARE v_bill_status VARCHAR(20);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT o.table_id, b.bill_status
  INTO v_table_id, v_bill_status
  FROM orders o
  JOIN bills b ON b.order_id = o.id
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF v_table_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order or bill was not found.';
  END IF;

  IF v_bill_status <> 'open' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This bill is already closed.';
  END IF;

  UPDATE bills SET bill_status = 'paid', closed_at = NOW() WHERE order_id = p_order_id;
  UPDATE orders SET order_status = 'closed' WHERE id = p_order_id;
  UPDATE restaurant_tables SET table_status = 'available' WHERE id = v_table_id;

  COMMIT;
END$$

DELIMITER ;

-- -----------------------------------------------------
-- 3. VIEWS
-- -----------------------------------------------------
-- Bill details: items, quantity and amount per table
CREATE OR REPLACE VIEW bill_details AS
SELECT
  b.id           AS bill_id,
  o.id           AS order_id,
  rt.table_number,
  mi.item_name,
  oi.quantity,
  oi.unit_price,
  oi.line_total  AS amount,
  b.total_amount AS bill_total,
  b.bill_status,
  o.ordered_at
FROM bills b
JOIN orders o             ON o.id  = b.order_id
JOIN restaurant_tables rt ON rt.id = o.table_id
JOIN order_items oi       ON oi.order_id = o.id
JOIN menu_items mi        ON mi.id = oi.menu_item_id;

-- Best selling dishes (paid bills only)
CREATE OR REPLACE VIEW best_selling_dishes AS
SELECT
  mi.id AS menu_item_id,
  mi.item_name,
  SUM(oi.quantity)   AS quantity_sold,
  SUM(oi.line_total) AS sales_amount
FROM order_items oi
JOIN menu_items mi ON mi.id = oi.menu_item_id
JOIN bills b       ON b.order_id = oi.order_id
WHERE b.bill_status = 'paid'
GROUP BY mi.id, mi.item_name;

-- Revenue per day
CREATE OR REPLACE VIEW revenue_by_day AS
SELECT
  DATE(closed_at)    AS sale_day,
  SUM(total_amount)  AS revenue
FROM bills
WHERE bill_status = 'paid' AND closed_at IS NOT NULL
GROUP BY DATE(closed_at);

-- Busiest hour
CREATE OR REPLACE VIEW busiest_hour AS
SELECT
  HOUR(ordered_at) AS order_hour,
  COUNT(*)         AS order_count
FROM orders
GROUP BY HOUR(ordered_at);

-- -----------------------------------------------------
-- 4. SAMPLE DATA + TEST (optional, you can delete this part)
-- -----------------------------------------------------
INSERT INTO menu_items (item_name, category, price) VALUES
  ('Paneer Butter Masala', 'Main Course', 220.00),
  ('Butter Naan',          'Bread',        40.00),
  ('Chicken Biryani',      'Main Course', 250.00),
  ('Cold Coffee',          'Drinks',       90.00);

INSERT INTO restaurant_tables (table_number) VALUES (1), (2), (3);

-- Open an order on table 1 (bill is created automatically)
INSERT INTO orders (table_id) VALUES (1);

-- Add items (price is copied automatically, bill total updates automatically)
INSERT INTO order_items (order_id, menu_item_id, quantity) VALUES
  (1, 1, 2),
  (1, 2, 4);

SELECT * FROM bill_details WHERE order_id = 1;

-- Pay the bill and free the table
CALL close_bill(1);

SELECT * FROM restaurant_tables;
SELECT * FROM best_selling_dishes ORDER BY quantity_sold DESC;
SELECT * FROM revenue_by_day ORDER BY sale_day DESC;
SELECT * FROM busiest_hour ORDER BY order_count DESC;
