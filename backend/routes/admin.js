const express = require('express');
const router = express.Router();
const { run, all, get } = require('../config/database');

// 管理员账号（实际应该用数据库存储和加密密码）
const ADMIN_USER = {
  username: 'admin',
  password: 'admin123'
};

// 管理员登录
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (username === ADMIN_USER.username && password === ADMIN_USER.password) {
      res.json({ 
        success: true, 
        token: 'admin_token_' + Date.now(),
        admin: {
          username: ADMIN_USER.username,
          role: 'administrator'
        }
      });
    } else {
      res.status(401).json({ success: false, error: '账号或密码错误' });
    }
  } catch (error) {
    console.error('管理员登录错误:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 获取统计数据
router.get('/stats', async (req, res) => {
  try {
    const total = await get('SELECT COUNT(*) as count FROM orders');
    const pending = await get("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
    const processing = await get("SELECT COUNT(*) as count FROM orders WHERE status = 'processing'");
    const completed = await get("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'");
    
    const revenue = await get("SELECT SUM(price) as total FROM orders WHERE status = 'completed'");
    
    res.json({
      totalOrders: total?.count || 0,
      pendingOrders: pending?.count || 0,
      processingOrders: processing?.count || 0,
      completedOrders: completed?.count || 0,
      totalRevenue: revenue?.total || 0
    });
  } catch (error) {
    console.error('获取统计数据错误:', error);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

// 获取所有订单（管理员）
router.get('/admin/orders', async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM orders WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const orders = await all(query, params);

    const formattedOrders = orders.map(order => ({
      id: order.id,
      order_no: order.order_no,
      status: order.status,
      status_text: order.status === 'pending' ? '待处理' : order.status === 'processing' ? '进行中' : order.status === 'completed' ? '已完成' : '已取消',
      service_type: order.service_type,
      service_name: '拖车救援',
      price: order.price,
      created_at: order.created_at,
      vehicle_type: order.vehicle_type,
      vehicle_plate: order.vehicle_plate,
      current_location: order.current_location,
      destination: order.destination,
      problem_description: order.problem_description,
      user_id: order.user_id,
      driver: order.driver_name ? {
        name: order.driver_name,
        phone: order.driver_phone,
        rating: order.driver_rating,
        vehicle_plate: order.rescue_vehicle_plate,
        vehicle_model: order.rescue_vehicle_model
      } : null
    }));

    res.json({ orders: formattedOrders });
  } catch (error) {
    console.error('获取订单列表错误:', error);
    res.status(500).json({ error: '获取订单失败' });
  }
});

// 获取订单详情（管理员）
router.get('/admin/orders/:id', async (req, res) => {
  try {
    const order = await get('SELECT * FROM orders WHERE id = ?', [req.params.id]);

    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    const timeline = await all('SELECT * FROM order_timeline WHERE order_id = ? ORDER BY created_at', [order.id]);

    const formattedOrder = {
      id: order.id,
      order_no: order.order_no,
      status: order.status,
      status_text: order.status === 'pending' ? '待处理' : order.status === 'processing' ? '进行中' : order.status === 'completed' ? '已完成' : '已取消',
      service_type: order.service_type,
      service_name: '拖车救援',
      price: order.price,
      created_at: order.created_at,
      vehicle_type: order.vehicle_type,
      vehicle_plate: order.vehicle_plate,
      current_location: order.current_location,
      destination: order.destination,
      problem_description: order.problem_description,
      user_id: order.user_id,
      driver: order.driver_name ? {
        name: order.driver_name,
        phone: order.driver_phone,
        rating: order.driver_rating,
        orders: 0,
        vehicle_plate: order.rescue_vehicle_plate,
        vehicle_model: order.rescue_vehicle_model
      } : null,
      timeline: timeline.map(t => ({
        time: new Date(t.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        content: t.description,
        completed: true
      }))
    };

    res.json({ order: formattedOrder });
  } catch (error) {
    console.error('获取订单详情错误:', error);
    res.status(500).json({ error: '获取订单失败' });
  }
});

// 更新订单状态（管理员）
router.put('/admin/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;

    if (!['pending', 'processing', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: '无效的状态' });
    }

    const order = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    // 更新订单状态
    await run('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);

    // 添加时间线记录
    const statusDescriptions = {
      'pending': '订单已提交，等待处理',
      'processing': '已分配司机，正在前往现场',
      'completed': '订单已完成',
      'cancelled': '订单已取消'
    };

    await run(
      'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
      [orderId, status, statusDescriptions[status]]
    );

    res.json({ 
      success: true, 
      message: '订单状态已更新',
      order: {
        id: orderId,
        status: status,
        status_text: statusDescriptions[status]
      }
    });
  } catch (error) {
    console.error('更新订单状态错误:', error);
    res.status(500).json({ error: '更新订单状态失败' });
  }
});

// 分配司机到订单（管理员）
router.put('/admin/orders/:id/driver', async (req, res) => {
  try {
    const { driver_id, driver_name, driver_phone, driver_rating, vehicle_plate, vehicle_model } = req.body;
    const orderId = req.params.id;

    const order = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    await run(`
      UPDATE orders SET 
        driver_id = ?, driver_name = ?, driver_phone = ?, driver_rating = ?,
        rescue_vehicle_plate = ?, rescue_vehicle_model = ?,
        status = 'processing'
      WHERE id = ?
    `, [driver_id, driver_name, driver_phone, driver_rating, vehicle_plate, vehicle_model, orderId]);

    await run(
      'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
      [orderId, 'processing', `已分配司机：${driver_name} (${vehicle_plate})`]
    );

    res.json({ 
      success: true, 
      message: '司机分配成功',
      driver: {
        id: driver_id,
        name: driver_name,
        phone: driver_phone,
        vehicle_plate: vehicle_plate,
        vehicle_model: vehicle_model
      }
    });
  } catch (error) {
    console.error('分配司机错误:', error);
    res.status(500).json({ error: '分配司机失败' });
  }
});

// 获取司机列表（管理员）
router.get('/admin/drivers', async (req, res) => {
  try {
    // 从订单中统计司机信息
    const drivers = await all(`
      SELECT 
        driver_id as id,
        driver_name as name,
        driver_phone as phone,
        driver_rating as rating,
        rescue_vehicle_plate as vehicle_plate,
        rescue_vehicle_model as vehicle_model,
        COUNT(*) as order_count
      FROM orders 
      WHERE driver_id IS NOT NULL
      GROUP BY driver_id
    `);

    // 添加模拟的司机状态
    const formattedDrivers = drivers.map((d, index) => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      rating: d.rating,
      orders: d.order_count,
      vehicle_plate: d.vehicle_plate,
      vehicle_model: d.vehicle_model,
      status: index % 3 === 0 ? '空闲' : '服务中'
    }));

    res.json({ drivers: formattedDrivers });
  } catch (error) {
    console.error('获取司机列表错误:', error);
    res.status(500).json({ error: '获取司机列表失败' });
  }
});

// 获取用户列表（管理员）
router.get('/admin/users', async (req, res) => {
  try {
    const users = await all(`
      SELECT 
        id,
        username,
        phone,
        balance,
        points,
        created_at,
        (SELECT COUNT(*) FROM orders WHERE user_id = users.id) as order_count,
        (SELECT SUM(price) FROM orders WHERE user_id = users.id AND status = 'completed') as total_spent
      FROM users
      ORDER BY created_at DESC
    `);

    const formattedUsers = users.map(u => ({
      id: u.id,
      username: u.username,
      phone: u.phone,
      balance: u.balance,
      points: u.points,
      orders: u.order_count || 0,
      total_spent: u.total_spent || 0,
      created_at: u.created_at
    }));

    res.json({ users: formattedUsers });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

module.exports = router;
