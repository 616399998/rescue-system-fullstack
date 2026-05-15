const express = require('express');
const router = express.Router();
const { get, all, run } = require('../config/database');
const { authMiddleware } = require('./auth');

// 获取当前用户信息（需登录）
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await get(
      'SELECT id, username, phone, avatar, balance, points, level, created_at FROM users WHERE id = ?',
      [req.user.userId]
    );

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const stats = await get(
      'SELECT COUNT(*) as total_orders, COALESCE(SUM(price), 0) as total_spent FROM orders WHERE user_id = ? AND status = ?',
      [req.user.userId, 'completed']
    );

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        avatar: user.avatar,
        balance: user.balance || 0,
        points: user.points || 0,
        level: user.level || '普通会员',
        total_orders: stats?.total_orders || 0,
        total_spent: stats?.total_spent || 0,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 获取用户车辆列表
router.get('/vehicles', authMiddleware, async (req, res) => {
  try {
    const vehicles = await all('SELECT * FROM vehicles WHERE user_id = ?', [req.user.userId]);
    res.json({ success: true, vehicles });
  } catch (error) {
    console.error('获取车辆列表错误:', error);
    res.status(500).json({ error: '获取车辆列表失败' });
  }
});

module.exports = router;
