-- 评价系统升级迁移脚本
-- 将评价表从司机评价改为用户评价司机

-- 1. 添加新字段到 order_ratings 表
ALTER TABLE order_ratings ADD COLUMN user_id INTEGER;
ALTER TABLE order_ratings ADD COLUMN user_rating INTEGER;
ALTER TABLE order_ratings ADD COLUMN user_comment TEXT;
ALTER TABLE order_ratings ADD COLUMN user_rating_at DATETIME;

-- 2. 将旧的 driver_rating 数据迁移到 user_rating（如果存在）
-- 注意：这取决于旧数据的结构，可能需要根据实际情况调整
UPDATE order_ratings 
SET user_rating = driver_rating, 
    user_comment = driver_comment, 
    user_rating_at = driver_rating_at
WHERE driver_rating IS NOT NULL AND user_rating IS NULL;

-- 3. 更新 orders 表，确保 rated 字段正确
-- 如果有已评价的订单，确保 rated = 1
UPDATE orders 
SET rated = 1 
WHERE id IN (SELECT order_id FROM order_ratings WHERE user_rating IS NOT NULL);

-- 4. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_order_ratings_order_id ON order_ratings(order_id);
CREATE INDEX IF NOT EXISTS idx_order_ratings_driver_id ON order_ratings(driver_id);
CREATE INDEX IF NOT EXISTS idx_order_ratings_user_id ON order_ratings(user_id);

-- 5. 更新司机的平均评分（基于用户评价）
UPDATE drivers 
SET rating = (
    SELECT ROUND(AVG(user_rating), 1) 
    FROM order_ratings 
    WHERE order_ratings.driver_id = drivers.id 
    AND user_rating IS NOT NULL
)
WHERE id IN (SELECT DISTINCT driver_id FROM order_ratings WHERE user_rating IS NOT NULL);

-- 迁移完成
SELECT '评价系统升级完成！' as message;
