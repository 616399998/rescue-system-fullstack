const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { run, get } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'rescue-system-secret-key-2025';

// 用户注册
router.post('/register', async (req, res) => {
  try {
    const { username, password, phone } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const existingUser = await get('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUser) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = await run(`INSERT INTO users (username, password, phone, balance, points, level) VALUES (?, ?, ?, 1286.00, 3200, 'VIP 会员')`, [username, hashedPassword, phone || '']);
    await run(`INSERT INTO vehicles (user_id, plate_number, brand, color, vehicle_type, is_default) VALUES (?, '京 A·88888', '大众', '白色', 'sedan', 1)`, [result.lastInsertRowid]);

    res.status(201).json({ message: '注册成功', userId: result.lastInsertRowid });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

// 用户登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const user = await get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(400).json({ error: '用户名或密码错误' });
    }

    const isValidPassword = bcrypt.compareSync(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: '登录成功',
      token,
      user: { id: user.id, username: user.username, phone: user.phone, avatar: user.avatar }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

module.exports = router;
