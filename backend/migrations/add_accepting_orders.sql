-- 为 drivers 表添加接单状态字段
ALTER TABLE drivers ADD COLUMN accepting_orders INTEGER DEFAULT 1;
ALTER TABLE drivers ADD COLUMN accepting_orders_updated_at DATETIME;
