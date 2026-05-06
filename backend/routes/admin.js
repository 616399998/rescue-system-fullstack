const express = require('express');
const router = express.Router();
const { run, all, get } = require('../config/database');

// 管理员账号
const ADMIN_USER = {
  username: 'admin',
  password: 'admin123'
};

// ==================== 管理员登录 ====================
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (username === ADMIN_USER.username && password === ADMIN_USER.password) {
      res.json({ 
        success: true, 
        token: 'admin_token_' + Date.now(),
        admin: { username: ADMIN_USER.username, role: 'administrator' }
      });
    } else {
      res.status(401).json({ success: false, error: '账号或密码错误' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ==================== 统计数据 ====================
router.get('/stats', async (req, res) => {
  try {
    const total = await get('SELECT COUNT(*) as count FROM orders');
    const pending = await get("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
    const processing = await get("SELECT COUNT(*) as count FROM orders WHERE status = 'processing'");
    const completed = await get("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'");
    const cancelled = await get("SELECT COUNT(*) as count FROM orders WHERE status = 'cancelled'");
    
    const revenue = await get("SELECT SUM(price) as total FROM orders WHERE status = 'completed'");
    const today = new Date().toISOString().split('T')[0];
    const todayOrders = await get(`SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = DATE('${today}')`);
    const todayRevenue = await get(`SELECT SUM(price) as total FROM orders WHERE DATE(created_at) = DATE('${today}') AND status = 'completed'`);
    
    res.json({
      totalOrders: total?.count || 0,
      pendingOrders: pending?.count || 0,
      processingOrders: processing?.count || 0,
      completedOrders: completed?.count || 0,
      cancelledOrders: cancelled?.count || 0,
      totalRevenue: revenue?.total || 0,
      todayOrders: todayOrders?.count || 0,
      todayRevenue: todayRevenue?.total || 0
    });
  } catch (error) {
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

// ==================== 订单管理 ====================

// 获取订单列表 - 文档第 68-79 项
router.get('/orders', async (req, res) => {
  try {
    const { status, page = 1, limit = 50, keyword } = req.query;
    
    let query = 'SELECT * FROM orders WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (keyword) {
      query += ' AND (order_no LIKE ? OR vehicle_plate LIKE ? OR owner_phone LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const orders = await all(query, params);

    const formattedOrders = orders.map(order => {
      let statusText = '待处理';
      if (order.status === 'processing') statusText = '进行中';
      else if (order.status === 'completed') statusText = '已完成';
      else if (order.status === 'cancelled') statusText = '已取消';

      return {
        id: order.id,
        order_no: order.order_no,
        status: order.status,
        status_text: statusText,
        service_type: order.service_type,
        service_name: order.service_type === 'accident' ? '事故拖车' : order.service_type === 'violation' ? '违法拖车' : '故障救援',
        price: order.price,
        created_at: order.created_at,
        vehicle_plate: order.vehicle_plate,
        current_location: order.current_location,
        destination: order.destination,
        owner_name: order.owner_name,
        owner_phone: order.owner_phone,
        user_id: order.user_id,
        driver: order.driver_name ? {
          name: order.driver_name,
          phone: order.driver_phone,
          rating: order.driver_rating,
          vehicle_plate: order.rescue_vehicle_plate,
          vehicle_model: order.rescue_vehicle_model
        } : null
      };
    });

    res.json({ orders: formattedOrders });
  } catch (error) {
    res.status(500).json({ error: '获取订单失败' });
  }
});

// 获取订单详情 - 文档第 79 项
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: '订单不存在' });

    const timeline = await all('SELECT * FROM order_timeline WHERE order_id = ? ORDER BY created_at', [order.id]);

    let statusText = '待处理';
    if (order.status === 'processing') statusText = '进行中';
    else if (order.status === 'completed') statusText = '已完成';
    else if (order.status === 'cancelled') statusText = '已取消';

    res.json({
      order: {
        id: order.id,
        order_no: order.order_no,
        status: order.status,
        status_text: statusText,
        service_type: order.service_type,
        price: order.price,
        created_at: order.created_at,
        vehicle_plate: order.vehicle_plate,
        current_location: order.current_location,
        // 兼容不同渠道的坐标字段
        address: order.address || order.found_address,
        destination: order.destination,
        destination_coord: order.destination_coord,
        problem_description: order.problem_description,
        owner_name: order.owner_name,
        owner_phone: order.owner_phone,
        movable: order.movable,
        special_note: order.special_note,
        photos: order.photos ? JSON.parse(order.photos) : [],
        driver: order.driver_name ? {
          name: order.driver_name,
          phone: order.driver_phone,
          rating: order.driver_rating,
          vehicle_plate: order.rescue_vehicle_plate,
          vehicle_model: order.rescue_vehicle_model
        } : null,
        timeline: timeline.map(t => ({
          time: new Date(t.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          content: t.description
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ error: '获取订单失败' });
  }
});

// 订单审核 - 文档第 69-70 项
router.put('/orders/:id/audit', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { passed, priority, reason } = req.body;

    const order = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return res.status(404).json({ error: '订单不存在' });

    if (!passed) {
      // 审核不通过，取消订单
      await run('UPDATE orders SET status = ? WHERE id = ?', ['cancelled', orderId]);
      await run(
        'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
        [orderId, 'cancelled', `审核不通过${reason ? '：' + reason : ''}`]
      );
    } else {
      // 审核通过，添加紧急程度
      await run('UPDATE orders SET priority = ?, status = ? WHERE id = ?', [priority || 'normal', 'pending', orderId]);
      await run(
        'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
        [orderId, 'pending', `审核通过，紧急程度：${priority === 'urgent' ? '紧急' : priority === 'high' ? '高' : '普通'}`]
      );
    }

    res.json({ success: true, message: '审核完成' });
  } catch (error) {
    res.status(500).json({ error: '审核失败' });
  }
});

// 派单 - 文档第 71 项
router.put('/orders/:id/dispatch', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { driver_id, driver_name, driver_phone, driver_rating, vehicle_plate, vehicle_model } = req.body;

    const order = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return res.status(404).json({ error: '订单不存在' });

    await run(`
      UPDATE orders SET 
        driver_id = ?, driver_name = ?, driver_phone = ?, driver_rating = ?,
        rescue_vehicle_plate = ?, rescue_vehicle_model = ?,
        status = 'processing'
      WHERE id = ?
    `, [driver_id, driver_name, driver_phone, driver_rating, vehicle_plate, vehicle_model, orderId]);

    await run(
      'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
      [orderId, 'processing', `已派单给 ${driver_name} (${vehicle_plate})，请电话联系客户`]
    );

    res.json({ success: true, message: '派单成功' });
  } catch (error) {
    res.status(500).json({ error: '派单失败' });
  }
});

// 更新订单状态 - 文档第 72-73 项
router.put('/orders/:id/status', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status, description } = req.body;

    if (!['pending', 'processing', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: '无效的状态' });
    }

    const order = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return res.status(404).json({ error: '订单不存在' });

    await run('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);

    const descriptions = {
      'pending': '订单已提交，等待处理',
      'processing': '已开始处理',
      'completed': '订单已完成',
      'cancelled': '订单已取消'
    };

    await run(
      'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
      [orderId, status, description || descriptions[status]]
    );

    res.json({ success: true, message: '状态已更新' });
  } catch (error) {
    res.status(500).json({ error: '更新状态失败' });
  }
});

// 完善订单保险单号 - 文档第 78 项
router.put('/orders/:id/insurance', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { insurance_no, insurance_company } = req.body;

    await run(`
      UPDATE orders SET 
        insurance_no = ?, insurance_company = ?
      WHERE id = ?
    `, [insurance_no, insurance_company || '', orderId]);

    res.json({ success: true, message: '保险信息已更新' });
  } catch (error) {
    res.status(500).json({ error: '更新失败' });
  }
});

// 订单结算 - 文档第 75 项
router.put('/orders/:id/settle', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { tow_fee, mileage_fee, extra_fee, total_fee } = req.body;

    await run(`
      UPDATE orders SET 
        tow_fee = ?, mileage_fee = ?, extra_fee = ?, total_fee = ?,
        status = 'completed', settled = 1
      WHERE id = ?
    `, [tow_fee, mileage_fee, extra_fee, total_fee || (tow_fee + mileage_fee + extra_fee), orderId]);

    await run(
      'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
      [orderId, 'completed', `订单已完成，总费用：¥${total_fee}`]
    );

    res.json({ success: true, message: '结算完成' });
  } catch (error) {
    res.status(500).json({ error: '结算失败' });
  }
});

// ==================== 司机管理 ====================

// 获取司机列表（从 drivers 表）- 文档第 82-85 项
router.get('/drivers', async (req, res) => {
  try {
    const drivers = await all(`
      SELECT 
        id,
        name,
        phone,
        license_no,
        qualification_no,
        status,
        rating,
        total_orders,
        created_at
      FROM drivers
      ORDER BY created_at DESC
    `);

    const formattedDrivers = drivers.map(d => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      license_no: d.license_no,
      qualification_no: d.qualification_no,
      rating: d.rating,
      total_orders: d.total_orders || 0,
      status: d.status, // active/offline/pending
      status_text: d.status === 'active' ? '正常' : d.status === 'offline' ? '已下线' : '待审核',
      created_at: d.created_at
    }));

    res.json({ drivers: formattedDrivers });
  } catch (error) {
    console.error('获取司机列表错误:', error);
    res.status(500).json({ error: '获取司机列表失败' });
  }
});

// 获取可派司机

// 司机审核通过
router.put('/drivers/:id/approve', async (req, res) => {
  try {
    const driverId = req.params.id;
    
    await run('UPDATE drivers SET status = ? WHERE id = ?', ['active', driverId]);
    
    res.json({ success: true, message: '司机已审核通过' });
  } catch (error) {
    res.status(500).json({ error: '审核失败' });
  }
});

// 司机审核拒绝/下线
router.put('/drivers/:id/reject', async (req, res) => {
  try {
    const driverId = req.params.id;
    const { reason } = req.body;
    
    await run('UPDATE drivers SET status = ? WHERE id = ?', ['offline', driverId]);
    
    res.json({ success: true, message: `司机已${reason ? '拒绝' : '下线'}` });
  } catch (error) {
    res.status(500).json({ error: '操作失败' });
  }
});

// 司机下线/激活切换
router.put('/drivers/:id/toggle-status', async (req, res) => {
  try {
    const driverId = req.params.id;
    const { status } = req.body; // 'active' or 'offline'
    
    if (!status || !['active', 'offline'].includes(status)) {
      return res.status(400).json({ error: '状态无效' });
    }
    
    await run('UPDATE drivers SET status = ? WHERE id = ?', [status, driverId]);
    
    const action = status === 'active' ? '激活' : '下线';
    res.json({ success: true, message: `司机已${action}` });
  } catch (error) {
    res.status(500).json({ error: '操作失败' });
  }
});

// 获取可派司机（从 drivers 表读取）
router.get('/dispatch/available-drivers', async (req, res) => {
  try {
    // 从 drivers 表获取所有正常状态的司机
    const drivers = await all(`
      SELECT 
        id,
        name,
        phone,
        rating,
        status,
        license_no,
        qualification_no,
        total_orders
      FROM drivers
      WHERE status = 'active'
      ORDER BY rating DESC, total_orders DESC
    `);

    // 获取正在服务中的司机 ID
    const busyDrivers = await all(`
      SELECT DISTINCT driver_id 
      FROM orders 
      WHERE status = 'processing' AND driver_id IS NOT NULL
    `);
    const busyIds = busyDrivers.map(d => d.driver_id);

    const formattedDrivers = drivers.map(d => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      rating: d.rating,
      license_no: d.license_no,
      qualification_no: d.qualification_no,
      total_orders: d.total_orders || 0,
      status: busyIds.includes(d.id) ? '服务中' : '空闲'
    }));

    res.json({ drivers: formattedDrivers });
  } catch (error) {
    console.error('获取可派司机错误:', error);
    res.status(500).json({ error: '获取司机列表失败' });
  }
});

// ==================== 用户管理 ====================

// 获取用户列表 - 文档第 100-102 项
router.get('/users', async (req, res) => {
  try {
    const users = await all(`
      SELECT 
        id, username, phone, balance, points, created_at,
        (SELECT COUNT(*) FROM orders WHERE user_id = users.id) as order_count,
        (SELECT SUM(price) FROM orders WHERE user_id = users.id AND status = 'completed') as total_spent
      FROM users ORDER BY created_at DESC
    `);

    res.json({
      users: users.map(u => ({
        id: u.id,
        username: u.username,
        phone: u.phone,
        balance: u.balance,
        points: u.points,
        orders: u.order_count || 0,
        total_spent: u.total_spent || 0,
        created_at: u.created_at
      }))
    });
  } catch (error) {
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// ==================== 财务报表 ====================

// 获取财务报表 - 文档第 105 项
router.get('/finance/report', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    let dateFilter = '';
    if (start_date && end_date) {
      dateFilter = `WHERE DATE(created_at) BETWEEN DATE('${start_date}') AND DATE('${end_date}')`;
    }

    const revenue = await get(`SELECT SUM(price) as total FROM orders WHERE status = 'completed' ${dateFilter}`);
    const orderCount = await get(`SELECT COUNT(*) as count FROM orders WHERE status = 'completed' ${dateFilter}`);
    const avgPrice = await get(`SELECT AVG(price) as avg FROM orders WHERE status = 'completed' ${dateFilter}`);

    const dailyStats = await all(`
      SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(price) as revenue
      FROM orders WHERE status = 'completed'
      ${dateFilter}
      GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 7
    `);

    res.json({
      totalRevenue: revenue?.total || 0,
      totalOrders: orderCount?.count || 0,
      avgPrice: avgPrice?.avg || 0,
      dailyStats: dailyStats || []
    });
  } catch (error) {
    res.status(500).json({ error: '获取财务报表失败' });
  }
});

// ==================== 统计分析 ====================

// 订单统计 - 文档第 104 项
router.get('/stats/orders', async (req, res) => {
  try {
    const { type = 'day' } = req.query;
    const dateFormat = type === 'month' ? '%Y-%m' : '%Y-%m-%d';
    
    const stats = await all(`
      SELECT 
        strftime('${dateFormat}', created_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM orders
      GROUP BY strftime('${dateFormat}', created_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: '获取统计失败' });
  }
});

// 绩效统计 - 文档第 106 项
router.get('/stats/performance', async (req, res) => {
  try {
    const performance = await all(`
      SELECT 
        driver_id,
        driver_name,
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
        AVG(CASE WHEN rating IS NOT NULL THEN rating END) as avg_rating
      FROM orders
      WHERE driver_id IS NOT NULL
      GROUP BY driver_id
      ORDER BY completed_orders DESC
    `);

    res.json({ performance });
  } catch (error) {
    res.status(500).json({ error: '获取绩效统计失败' });
  }
});

// ==================== 评价管理 ====================

// 获取所有评价列表（后台管理）
router.get('/ratings', async (req, res) => {
  try {
    const { page = 1, limit = 50, driver_id, rating_filter } = req.query;
    
    let query = `
      SELECT 
        r.*,
        o.order_no,
        o.driver_id,
        o.user_id,
        d.name as driver_name,
        d.phone as driver_phone,
        u.username as user_name
      FROM order_ratings r
      JOIN orders o ON r.order_id = o.id
      LEFT JOIN drivers d ON o.driver_id = d.id
      LEFT JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (driver_id) {
      query += ' AND r.driver_id = ?';
      params.push(driver_id);
    }

    if (rating_filter) {
      query += ' AND r.user_rating = ?';
      params.push(parseInt(rating_filter));
    }

    query += ' ORDER BY r.user_rating_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const ratings = await all(query, params);

    // 统计总数
    const countQuery = `SELECT COUNT(*) as total FROM order_ratings r JOIN orders o ON r.order_id = o.id WHERE 1=1`;
    const countParams = [];
    if (driver_id) {
      countQuery += ' AND r.driver_id = ?';
      countParams.push(driver_id);
    }
    if (rating_filter) {
      countQuery += ' AND r.user_rating = ?';
      countParams.push(parseInt(rating_filter));
    }
    const countResult = await get(countQuery, countParams);

    res.json({
      ratings: ratings.map(r => ({
        id: r.id,
        order_id: r.order_id,
        order_no: r.order_no,
        driver_id: r.driver_id,
        driver_name: r.driver_name || '未知司机',
        driver_phone: r.driver_phone || '',
        user_id: r.user_id,
        user_name: r.user_name || '匿名用户',
        rating: r.user_rating,
        comment: r.user_comment,
        created_at: r.user_rating_at
      })),
      total: countResult?.total || 0,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('获取评价列表错误:', error);
    res.status(500).json({ error: '获取评价列表失败' });
  }
});

// 获取评价详情
router.get('/ratings/:id', async (req, res) => {
  try {
    const ratingId = req.params.id;

    const rating = await get(`
      SELECT 
        r.*,
        o.order_no,
        o.current_location,
        o.destination,
        d.name as driver_name,
        d.phone as driver_phone,
        u.username as user_name
      FROM order_ratings r
      JOIN orders o ON r.order_id = o.id
      LEFT JOIN drivers d ON o.driver_id = d.id
      LEFT JOIN users u ON o.user_id = u.id
      WHERE r.id = ?
    `, [ratingId]);

    if (!rating) {
      return res.status(404).json({ error: '评价不存在' });
    }

    res.json({
      rating: {
        id: rating.id,
        order_id: rating.order_id,
        order_no: rating.order_no,
        driver_id: rating.driver_id,
        driver_name: rating.driver_name,
        driver_phone: rating.driver_phone,
        user_id: rating.user_id,
        user_name: rating.user_name,
        rating: rating.user_rating,
        comment: rating.user_comment,
        location: rating.current_location,
        destination: rating.destination,
        created_at: rating.user_rating_at
      }
    });
  } catch (error) {
    console.error('获取评价详情错误:', error);
    res.status(500).json({ error: '获取评价详情失败' });
  }
});

// 删除评价（管理员权限）
router.delete('/ratings/:id', async (req, res) => {
  try {
    const ratingId = req.params.id;

    // 检查评价是否存在
    const existing = await get('SELECT * FROM order_ratings WHERE id = ?', [ratingId]);
    if (!existing) {
      return res.status(404).json({ error: '评价不存在' });
    }

    // 删除评价
    await run('DELETE FROM order_ratings WHERE id = ?', [ratingId]);

    // 重新计算司机平均评分
    const driverId = existing.driver_id;
    if (driverId) {
      const avgResult = await get('SELECT AVG(user_rating) as avg_rating FROM order_ratings WHERE driver_id = ? AND user_rating IS NOT NULL', [driverId]);
      const newRating = avgResult && avgResult.avg_rating ? Math.round(avgResult.avg_rating * 10) / 10 : 5.0;
      await run('UPDATE drivers SET rating = ? WHERE id = ?', [newRating, driverId]);
    }

    res.json({ success: true, message: '评价已删除' });
  } catch (error) {
    console.error('删除评价错误:', error);
    res.status(500).json({ error: '删除评价失败' });
  }
});

// 获取司机评价统计
router.get('/drivers/:id/ratings/stats', async (req, res) => {
  try {
    const driverId = req.params.id;

    const stats = await get(`
      SELECT 
        COUNT(*) as total_ratings,
        AVG(user_rating) as avg_rating,
        SUM(CASE WHEN user_rating = 5 THEN 1 ELSE 0 END) as five_star,
        SUM(CASE WHEN user_rating = 4 THEN 1 ELSE 0 END) as four_star,
        SUM(CASE WHEN user_rating = 3 THEN 1 ELSE 0 END) as three_star,
        SUM(CASE WHEN user_rating = 2 THEN 1 ELSE 0 END) as two_star,
        SUM(CASE WHEN user_rating = 1 THEN 1 ELSE 0 END) as one_star
      FROM order_ratings
      WHERE driver_id = ? AND user_rating IS NOT NULL
    `, [driverId]);

    res.json({
      stats: {
        total: stats?.total_ratings || 0,
        average: stats?.avg_rating || 0,
        distribution: {
          5: stats?.five_star || 0,
          4: stats?.four_star || 0,
          3: stats?.three_star || 0,
          2: stats?.two_star || 0,
          1: stats?.one_star || 0
        }
      }
    });
  } catch (error) {
    console.error('获取司机评价统计错误:', error);
    res.status(500).json({ error: '获取评价统计失败' });
  }
});

module.exports = router;
