const express = require('express');
const router = express.Router();
const { run } = require('../config/database');

// 充值金额配置
const rechargeConfig = { 50: 5, 100: 15, 200: 40, 300: 60, 500: 100, 1000: 200 };

// 创建充值记录
router.post('/', async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 10 || amount > 10000) {
      return res.status(400).json({ error: '充值金额必须在 10-10000 元之间' });
    }

    const bonus = rechargeConfig[amount] || 0;
    const totalAmount = parseFloat(amount) + bonus;

    await run(`INSERT INTO recharge_records (user_id, amount, bonus, status) VALUES (?, ?, ?, 'completed')`, [1, amount, bonus]);
    await run(`UPDATE users SET balance = balance + ? WHERE id = 1`, [totalAmount]);

    res.json({ message: '充值成功', amount: parseFloat(amount), bonus: bonus, totalAmount: totalAmount });
  } catch (error) {
    console.error('充值错误:', error);
    res.status(500).json({ error: '充值失败' });
  }
});

module.exports = router;
