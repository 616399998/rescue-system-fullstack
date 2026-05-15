const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { run, get } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'rescue-system-secret-key-2025';

// JWT 鉴权中间件
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

// 用户注册（手机号 + 密码）
router.post('/register', async (req, res) => {
  try {
    const { phone, password, username } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: '手机号和密码不能为空' });
    }

    if (!/^1\d{10}$/.test(phone)) {
      return res.status(400).json({ error: '手机号格式不正确' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
    }

    // 检查手机号是否已注册
    const existing = await get('SELECT id FROM users WHERE phone = ?', [phone]);
    if (existing) {
      return res.status(400).json({ error: '该手机号已注册' });
    }

    const displayName = username || `用户${phone.slice(-4)}`;
    const hashedPassword = bcrypt.hashSync(password, 10);

    const result = await run(
      `INSERT INTO users (username, password, phone, balance, points, level) VALUES (?, ?, ?, 0, 0, '普通会员')`,
      [displayName, hashedPassword, phone]
    );

    const token = jwt.sign(
      { userId: result.lastInsertRowid, username: displayName, phone },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: '注册成功',
      token,
      user: {
        id: result.lastInsertRowid,
        username: displayName,
        phone,
        balance: 0,
        points: 0,
        level: '普通会员'
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

// 用户登录（手机号 + 密码）
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: '手机号和密码不能为空' });
    }

    const user = await get('SELECT * FROM users WHERE phone = ?', [phone]);
    if (!user) {
      return res.status(400).json({ error: '手机号或密码错误' });
    }

    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) {
      return res.status(400).json({ error: '手机号或密码错误' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, phone: user.phone },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        avatar: user.avatar,
        balance: user.balance || 0,
        points: user.points || 0,
        level: user.level || '普通会员'
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

// 获取当前用户信息
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await get(
      'SELECT id, username, phone, avatar, balance, points, level, created_at FROM users WHERE id = ?',
      [req.user.userId]
    );

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

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
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 修改用户名
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || username.trim().length === 0) {
      return res.status(400).json({ error: '用户名不能为空' });
    }
    await run('UPDATE users SET username = ? WHERE id = ?', [username.trim(), req.user.userId]);
    res.json({ success: true, message: '修改成功' });
  } catch (error) {
    console.error('修改用户名错误:', error);
    res.status(500).json({ error: '修改失败' });
  }
});

// 修改密码
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请输入旧密码和新密码' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少 6 位' });
    }

    const user = await get('SELECT password FROM users WHERE id = ?', [req.user.userId]);
    if (!bcrypt.compareSync(oldPassword, user.password)) {
      return res.status(400).json({ error: '旧密码错误' });
    }

    const hashed = bcrypt.hashSync(newPassword, 10);
    await run('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.userId]);
    res.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('修改密码错误:', error);
    res.status(500).json({ error: '修改密码失败' });
  }
});

module.exports = { router, authMiddleware };
