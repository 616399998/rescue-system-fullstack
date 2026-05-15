const express = require('express');
const router = express.Router();
const { run, get } = require('../config/database');
const { authMiddleware } = require('./auth');

// 充值金额配置
const rechargeConfig = { 50: 5, 100: 15, 200: 40, 300: 60, 500: 100, 1000: 200 };

// 创建充值记录（需登录）
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.userId;

    if (!amount || amount < 10 || amount > 10000) {
      return res.status(400).json({ error: '充值金额必须在 10-10000 元之间' });
    }

    const bonus = rechargeConfig[amount] || 0;
    const totalAmount = parseFloat(amount) + bonus;

    await run(`INSERT INTO recharge_records (user_id, amount, bonus, status) VALUES (?, ?, ?, 'completed')`, [userId, amount, bonus]);
    await run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [totalAmount, userId]);

    // 更新会员等级
    const user = await get('SELECT balance, points FROM users WHERE id = ?', [userId]);
    let newLevel = '普通会员';
    if (user && user.balance >= 5000) newLevel = '钻石会员';
    else if (user && user.balance >= 2000) newLevel = '金卡会员';
    else if (user && user.balance >= 500) newLevel = 'VIP 会员';
    
    await run('UPDATE users SET level = ?, points = points + ? WHERE id = ?', [newLevel, Math.floor(totalAmount * 10), userId]);

    res.json({ 
      success: true,
      message: '充值成功', 
      amount: parseFloat(amount), 
      bonus, 
      totalAmount,
      newLevel
    });
  } catch (error) {
    console.error('充值错误:', error);
    res.status(500).json({ error: '充值失败' });
  }
});

module.exports = router;
