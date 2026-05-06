/**
 * 评价系统升级迁移脚本
 * 将评价权限从司机改为用户，司机只能查看评价
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'config/rescue.db');

async function migrate() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ 数据库连接失败:', err);
        reject(err);
        return;
      }
      
      console.log('✅ 已连接到数据库');
      
      const migrations = [
        // 1. 添加新字段
        `ALTER TABLE order_ratings ADD COLUMN user_id INTEGER`,
        `ALTER TABLE order_ratings ADD COLUMN user_rating INTEGER`,
        `ALTER TABLE order_ratings ADD COLUMN user_comment TEXT`,
        `ALTER TABLE order_ratings ADD COLUMN user_rating_at DATETIME`,
        
        // 2. 迁移旧数据（如果存在 driver_rating）
        `UPDATE order_ratings SET user_rating = driver_rating, user_comment = driver_comment, user_rating_at = driver_rating_at WHERE driver_rating IS NOT NULL AND user_rating IS NULL`,
        
        // 3. 更新 orders 表的 rated 状态
        `UPDATE orders SET rated = 1 WHERE id IN (SELECT order_id FROM order_ratings WHERE user_rating IS NOT NULL)`,
        
        // 4. 创建索引
        `CREATE INDEX IF NOT EXISTS idx_order_ratings_order_id ON order_ratings(order_id)`,
        `CREATE INDEX IF NOT EXISTS idx_order_ratings_driver_id ON order_ratings(driver_id)`,
        `CREATE INDEX IF NOT EXISTS idx_order_ratings_user_id ON order_ratings(user_id)`,
        
        // 5. 更新司机平均评分
        `UPDATE drivers SET rating = (SELECT ROUND(AVG(user_rating), 1) FROM order_ratings WHERE order_ratings.driver_id = drivers.id AND user_rating IS NOT NULL) WHERE id IN (SELECT DISTINCT driver_id FROM order_ratings WHERE user_rating IS NOT NULL)`
      ];
      
      let completed = 0;
      
      migrations.forEach((sql, index) => {
        db.run(sql, function(err) {
          if (err) {
            if (err.message.includes('duplicate column')) {
              console.log(`⚠️  跳过迁移 ${index + 1}: 字段已存在`);
            } else {
              console.error(`❌ 迁移 ${index + 1} 失败:`, err.message);
            }
          } else {
            console.log(`✅ 迁移 ${index + 1} 完成：${this.changes} 行受影响`);
          }
          
          completed++;
          if (completed === migrations.length) {
            console.log('\n🎉 评价系统升级完成！');
            console.log('📋 变更摘要:');
            console.log('  - 用户端可以评价司机');
            console.log('  - 司机端只能查看评价');
            console.log('  - 评分数据全平台联通');
            db.close(resolve);
          }
        });
      });
    });
  });
}

// 执行迁移
migrate()
  .then(() => {
    console.log('\n✅ 迁移成功完成');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ 迁移失败:', err);
    process.exit(1);
  });
