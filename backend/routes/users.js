const express = require('express');
const router = express.Router();
const { get, all } = require('../config/database');

// 获取用户信息
router.get('/profile', async (req, res) => {
  try {
    const user = await get(`SELECT id, username, phone, avatar, balance, points, level, created_at FROM users WHERE id = 1`);

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const stats = await get(`SELECT COUNT(*) as total_orders, SUM(price) as total_spent FROM orders WHERE user_id = 1`);

    res.json({
      user: {
        ...user,
        total_orders: stats?.total_orders || 28,
        total_spent: stats?.total_spent || 5680
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 获取用户车辆列表
router.get('/vehicles', async (req, res) => {
  try {
    const vehicles = await all(`SELECT * FROM vehicles WHERE user_id = 1`);
    res.json({ vehicles });
  } catch (error) {
    console.error('获取车辆列表错误:', error);
    res.status(500).json({ error: '获取车辆列表失败' });
  }
});

module.exports = router;
