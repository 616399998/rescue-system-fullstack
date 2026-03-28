#!/bin/bash

# 智慧救援系统 - 司机端修复部署脚本
# 2026-03-28

echo "🚀 开始部署司机端修复..."

# 1. 拉取最新代码
echo "📥 拉取最新代码..."
cd /home/admin/.openclaw/workspace/rescue-system-fullstack
git pull origin main

# 2. 数据库迁移
echo "🗄️ 执行数据库迁移..."
cd backend
node -e "
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('config/rescue.db');

db.run('ALTER TABLE drivers ADD COLUMN accepting_orders INTEGER DEFAULT 1', (err) => {
  if (err && !err.message.includes('duplicate')) console.error('添加字段失败:', err);
  else console.log('✅ 已添加 accepting_orders 字段');
});

db.run('ALTER TABLE drivers ADD COLUMN accepting_orders_updated_at DATETIME', (err) => {
  if (err && !err.message.includes('duplicate')) console.error('添加时间字段失败:', err);
  else console.log('✅ 已添加 accepting_orders_updated_at 字段');
});

db.run('UPDATE drivers SET accepting_orders = 1, accepting_orders_updated_at = CURRENT_TIMESTAMP WHERE accepting_orders IS NULL', (err) => {
  if (err) console.error('更新失败:', err);
  else console.log('✅ 已更新现有司机的接单状态');
});

setTimeout(() => db.close(), 1000);
"

# 3. 重启服务
echo "🔄 重启服务..."
pm2 restart rescue || (cd /home/admin/.openclaw/workspace/rescue-system-fullstack/backend && npm start &)

echo ""
echo "✅ 部署完成！"
echo ""
echo "📱 访问地址:"
echo "  司机端：https://akesurescue.com/driver.html"
echo "  后台管理：https://akesurescue.com/admin.html"
echo ""
echo "🔧 修复内容:"
echo "  ✅ 修复订单列表显示问题"
echo "  ✅ 修复接单状态切换功能"
echo "  ✅ 优化路线显示逻辑"
echo ""
echo "📋 测试账号:"
echo "  13900139001 / 123456 - 王师傅"
echo ""
