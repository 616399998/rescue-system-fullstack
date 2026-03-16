const express = require('express');
const router = express.Router();
const { db } = require('../config/database');

// 充值金额配置
const rechargeConfig = {
  50: 5,
  100: 15,
  200: 40,
  300: 60,
  500: 100,
  1000: 200
};

// 创建充值记录
router.post('/', (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 10 || amount > 10000) {
      return res.status(400).json({ error: '充值金额必须在 10-10000 元之间' });
    }

    // 计算赠送金额
    const bonus = rechargeConfig[amount] || 0;
    const totalAmount = parseFloat(amount) + bonus;

    // 插入充值记录
    db.prepare(`
      INSERT INTO recharge_records (user_id, amount, bonus, status)
      VALUES (?, ?, ?, 'completed')
    `).run(1, amount, bonus); // 默认用户 ID

    // 更新用户余额
    db.prepare(`
      UPDATE users SET balance = balance + ? WHERE id = ?
    `).run(totalAmount, 1);

    res.json({
      message: '充值成功',
      amount: parseFloat(amount),
      bonus: bonus,
      totalAmount: totalAmount
    });
  } catch (error) {
    console.error('充值错误:', error);
    res.status(500).json({ error: '充值失败' });
  }
});

// 获取充值记录
router.get('/records', (req, res) => {
  try {
    const records = db.prepare(`
      SELECT * FROM recharge_records WHERE user_id = 1 ORDER BY created_at DESC LIMIT 20
    `).all(); // 默认用户 ID

    res.json({ records });
  } catch (error) {
    console.error('获取充值记录错误:', error);
    res.status(500).json({ error: '获取充值记录失败' });
  }
});

module.exports = router;
