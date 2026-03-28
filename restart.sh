#!/bin/bash
# 智慧救援系统 - 一键重启脚本
# 使用方法：复制下面这行命令到服务器终端执行

echo "🔄 正在重启服务..."

# 停止旧进程
pkill -9 -f "node.*server.js" 2>/dev/null
sleep 2

# 启动新进程
cd /home/admin/.openclaw/workspace/rescue-system-fullstack/backend
nohup node server.js > /tmp/rescue.log 2>&1 &

# 等待启动
sleep 3

# 验证
if curl -s http://localhost:3000/api/health | grep -q "ok"; then
    echo "✅ 服务重启成功！"
    echo "📱 访问地址：https://akesurescue.com/driver.html"
else
    echo "❌ 服务启动失败，请检查日志：/tmp/rescue.log"
fi
