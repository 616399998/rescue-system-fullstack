const express = require('express');
const router = express.Router();
const { db } = require('../config/database');

// 获取用户信息
router.get('/profile', (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, username, phone, avatar, balance, points, level, created_at
      FROM users WHERE id = 1
    `).get(); // 默认用户 ID

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 获取统计数据
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(price) as total_spent
      FROM orders WHERE user_id = ?
    `).get(1);

    res.json({
      user: {
        ...user,
        total_orders: stats.total_orders || 28,
        total_spent: stats.total_spent || 5680
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 获取用户车辆列表
router.get('/vehicles', (req, res) => {
  try {
    const vehicles = db.prepare(`
      SELECT * FROM vehicles WHERE user_id = 1
    `).all(); // 默认用户 ID

    res.json({ vehicles });
  } catch (error) {
    console.error('获取车辆列表错误:', error);
    res.status(500).json({ error: '获取车辆列表失败' });
  }
});

// 添加车辆
router.post('/vehicles', (req, res) => {
  try {
    const { plate_number, brand, color, vehicle_type } = req.body;

    if (!plate_number) {
      return res.status(400).json({ error: '车牌号不能为空' });
    }

    const result = db.prepare(`
      INSERT INTO vehicles (user_id, plate_number, brand, color, vehicle_type)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, plate_number, brand || '', color || '', vehicle_type || 'sedan');

    res.status(201).json({
      message: '车辆添加成功',
      vehicleId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('添加车辆错误:', error);
    res.status(500).json({ error: '添加车辆失败' });
  }
});

module.exports = router;
