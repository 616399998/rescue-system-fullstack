const express = require('express');
const router = express.Router();
const { exec } = require('child_process');

// GitHub webhook 接收
router.post('/deploy', async (req, res) => {
  const secret = req.headers['x-hub-signature-256'];
  const event = req.headers['x-github-event'];
  
  console.log('收到 webhook:', event);
  
  if (event === 'ping') {
    return res.json({ ok: true, message: 'pong' });
  }
  
  if (event !== 'push') {
    return res.status(400).json({ error: '只支持 push 事件' });
  }
  
  // 简单验证（生产环境应该验证签名）
  console.log('开始部署...');
  
  // 执行部署脚本
  exec(`
    cd /home/admin/.openclaw/workspace/rescue-system-fullstack &&
    git pull origin main &&
    pkill -9 -f "node.*server.js" || true &&
    sleep 2 &&
    cd backend &&
    nohup node server.js > /tmp/rescue.log 2>&1 &
    sleep 3 &&
    curl -s http://localhost:3000/api/health
  `, (error, stdout, stderr) => {
    if (error) {
      console.error('部署失败:', error);
      return res.status(500).json({ error: '部署失败', details: stderr });
    }
    console.log('部署成功:', stdout);
    res.json({ success: true, message: '部署成功', output: stdout });
  });
  
  // 立即返回，不等待部署完成
  res.json({ ok: true, message: '部署已启动' });
});

module.exports = router;
