const express = require('express');
const router = express.Router();
const { run, all, get } = require('../config/database');
const jwt = require('jsonwebtoken');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'admin-secret-key-2025';

// 管理员账号
const ADMIN_USER = {
  username: 'admin',
  password: 'admin123'
};

// 管理员鉴权中间件
function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: '无权限' });
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '登录已过期' });
  }
}

// ==================== 管理员登录 ====================
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (username === ADMIN_USER.username && password === ADMIN_USER.password) {
      const token = jwt.sign(
        { username: ADMIN_USER.username, role: 'admin' },
        ADMIN_JWT_SECRET,
        { expiresIn: '7d' }
      );
      res.json({ 
        success: true, 
        token,
        admin: { username: ADMIN_USER.username, role: 'administrator' }
      });
    } else {
      res.status(401).json({ success: false, error: '账号或密码错误' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 验证 token
router.get('/verify', adminAuth, (req, res) => {
  res.json({ success: true, admin: req.admin });
});

// ==================== 统计数据 ====================
router.get('/stats', adminAuth, async (req, res) => {
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

    const totalUsers = await get('SELECT COUNT(*) as count FROM users');
    const totalDrivers = await get("SELECT COUNT(*) as count FROM drivers WHERE status = 'active'");
    const totalVehicles = await get("SELECT COUNT(*) as count FROM vehicles WHERE status = 'active'");
    
    res.json({
      totalOrders: total?.count || 0,
      pendingOrders: pending?.count || 0,
      processingOrders: processing?.count || 0,
      completedOrders: completed?.count || 0,
      cancelledOrders: cancelled?.count || 0,
      totalRevenue: revenue?.total || 0,
      todayOrders: todayOrders?.count || 0,
      todayRevenue: todayRevenue?.total || 0,
      totalUsers: totalUsers?.count || 0,
      totalDrivers: totalDrivers?.count || 0,
      totalVehicles: totalVehicles?.count || 0
    });
  } catch (error) {
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

// ==================== 订单管理 ====================
router.get('/orders', adminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 50, keyword, channel } = req.query;
    
    let query = 'SELECT * FROM orders WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (channel && channel !== 'all') {
      query += ' AND channel = ?';
      params.push(channel);
    }

    if (keyword) {
      query += ' AND (order_no LIKE ? OR vehicle_plate LIKE ? OR owner_phone LIKE ? OR owner_name LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    // 计算总数
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countResult = await get(countQuery, params);
    const totalCount = countResult?.count || 0;

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
        channel: order.channel || 'personal',
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

    res.json({ orders: formattedOrders, total: totalCount, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('获取订单错误:', error);
    res.status(500).json({ error: '获取订单失败' });
  }
});

// 订单导出 CSV
router.get('/orders/export', adminAuth, async (req, res) => {
  try {
    const { status, keyword, channel, start_date, end_date } = req.query;
    
    let query = 'SELECT * FROM orders WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    if (channel && channel !== 'all') {
      query += ' AND channel = ?';
      params.push(channel);
    }
    if (keyword) {
      query += ' AND (order_no LIKE ? OR vehicle_plate LIKE ? OR owner_phone LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (start_date) {
      query += ' AND DATE(created_at) >= DATE(?)';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND DATE(created_at) <= DATE(?)';
      params.push(end_date);
    }

    query += ' ORDER BY created_at DESC LIMIT 5000';

    const orders = await all(query, params);

    const statusMap = { pending: '待处理', processing: '进行中', completed: '已完成', cancelled: '已取消' };
    const channelMap = { personal: '个人端', traffic: '交管端', enforcement: '执法端', insurance: '保险端', driver: '司机端' };

    // 生成 CSV
    const BOM = '\uFEFF';
    let csv = BOM + '订单号,渠道,状态,服务类型,当前位置,目的地,车牌号,车主,联系电话,价格,司机,司机电话,创建时间\n';
    orders.forEach(o => {
      csv += `"${o.order_no}","${channelMap[o.channel] || o.channel || '个人端'}","${statusMap[o.status] || o.status}","${o.service_type === 'accident' ? '事故拖车' : o.service_type === 'violation' ? '违法拖车' : '故障救援'}","${(o.current_location || '').replace(/"/g, '""')}","${(o.destination || '').replace(/"/g, '""')}","${o.vehicle_plate || ''}","${o.owner_name || ''}","${o.owner_phone || ''}","${o.price}","${o.driver_name || ''}","${o.driver_phone || ''}","${o.created_at}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=orders_${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('导出订单错误:', error);
    res.status(500).json({ error: '导出失败' });
  }
});

// 订单详情
router.get('/orders/:id', adminAuth, async (req, res) => {
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
        channel: order.channel || 'personal',
        price: order.price,
        created_at: order.created_at,
        vehicle_plate: order.vehicle_plate,
        current_location: order.current_location,
        address: order.address || order.found_address,
        destination: order.destination,
        destination_coord: order.destination_coord,
        problem_description: order.problem_description,
        owner_name: order.owner_name,
        owner_phone: order.owner_phone,
        movable: order.movable,
        special_note: order.special_note,
        photos: order.photos ? JSON.parse(order.photos) : [],
        insurance_no: order.insurance_no,
        insurance_company: order.insurance_company,
        tow_fee: order.tow_fee,
        mileage_fee: order.mileage_fee,
        extra_fee: order.extra_fee,
        total_fee: order.total_fee,
        settled: order.settled,
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

// 订单审核
router.put('/orders/:id/audit', adminAuth, async (req, res) => {
  try {
    const orderId = req.params.id;
    const { passed, priority, reason } = req.body;
    const order = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return res.status(404).json({ error: '订单不存在' });

    if (!passed) {
      await run('UPDATE orders SET status = ? WHERE id = ?', ['cancelled', orderId]);
      await run('INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
        [orderId, 'cancelled', `审核不通过${reason ? '：' + reason : ''}`]);
    } else {
      await run('UPDATE orders SET priority = ?, status = ? WHERE id = ?', [priority || 'normal', 'pending', orderId]);
      await run('INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
        [orderId, 'pending', `审核通过，紧急程度：${priority === 'urgent' ? '紧急' : priority === 'high' ? '高' : '普通'}`]);
    }
    res.json({ success: true, message: '审核完成' });
  } catch (error) {
    res.status(500).json({ error: '审核失败' });
  }
});

// 派单
router.put('/orders/:id/dispatch', adminAuth, async (req, res) => {
  try {
    const orderId = req.params.id;
    const { driver_id, driver_name, driver_phone, driver_rating, vehicle_plate, vehicle_model } = req.body;
    const order = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return res.status(404).json({ error: '订单不存在' });

    await run(`
      UPDATE orders SET 
        driver_id = ?, driver_name = ?, driver_phone = ?, driver_rating = ?,
        rescue_vehicle_plate = ?, rescue_vehicle_model = ?, status = 'processing'
      WHERE id = ?
    `, [driver_id, driver_name, driver_phone, driver_rating, vehicle_plate, vehicle_model, orderId]);

    await run('INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
      [orderId, 'processing', `已派单给 ${driver_name} (${vehicle_plate})，请电话联系客户`]);

    // 更新司机总订单数
    await run('UPDATE drivers SET total_orders = total_orders + 1 WHERE id = ?', [driver_id]);

    res.json({ success: true, message: '派单成功' });
  } catch (error) {
    res.status(500).json({ error: '派单失败' });
  }
});

// 更新订单状态
router.put('/orders/:id/status', adminAuth, async (req, res) => {
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
      'pending': '订单已提交，等待处理', 'processing': '已开始处理',
      'completed': '订单已完成', 'cancelled': '订单已取消'
    };
    await run('INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
      [orderId, status, description || descriptions[status]]);
    res.json({ success: true, message: '状态已更新' });
  } catch (error) {
    res.status(500).json({ error: '更新状态失败' });
  }
});

// 订单结算
router.put('/orders/:id/settle', adminAuth, async (req, res) => {
  try {
    const orderId = req.params.id;
    const { tow_fee, mileage_fee, extra_fee, total_fee } = req.body;
    await run(`
      UPDATE orders SET tow_fee = ?, mileage_fee = ?, extra_fee = ?, total_fee = ?,
        status = 'completed', settled = 1 WHERE id = ?
    `, [tow_fee, mileage_fee, extra_fee, total_fee || (tow_fee + mileage_fee + extra_fee), orderId]);
    await run('INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
      [orderId, 'completed', `订单已完成，总费用：¥${total_fee}`]);
    res.json({ success: true, message: '结算完成' });
  } catch (error) {
    res.status(500).json({ error: '结算失败' });
  }
});

// 完善保险信息
router.put('/orders/:id/insurance', adminAuth, async (req, res) => {
  try {
    const orderId = req.params.id;
    const { insurance_no, insurance_company } = req.body;
    await run('UPDATE orders SET insurance_no = ?, insurance_company = ? WHERE id = ?',
      [insurance_no, insurance_company || '', orderId]);
    res.json({ success: true, message: '保险信息已更新' });
  } catch (error) {
    res.status(500).json({ error: '更新失败' });
  }
});

// ==================== 司机管理 ====================
router.get('/drivers', adminAuth, async (req, res) => {
  try {
    const { keyword, status } = req.query;
    let query = 'SELECT * FROM drivers WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    if (keyword) {
      query += ' AND (name LIKE ? OR phone LIKE ? OR license_no LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    query += ' ORDER BY created_at DESC';
    const drivers = await all(query, params);

    res.json({
      drivers: drivers.map(d => ({
        id: d.id,
        name: d.name,
        phone: d.phone,
        license_no: d.license_no,
        qualification_no: d.qualification_no,
        rating: d.rating,
        total_orders: d.total_orders || 0,
        status: d.status,
        status_text: d.status === 'active' ? '正常' : d.status === 'offline' ? '已下线' : '待审核',
        accepting_orders: d.accepting_orders,
        created_at: d.created_at
      }))
    });
  } catch (error) {
    console.error('获取司机列表错误:', error);
    res.status(500).json({ error: '获取司机列表失败' });
  }
});

// 添加司机
router.post('/drivers', adminAuth, async (req, res) => {
  try {
    const { name, phone, license_no, qualification_no } = req.body;
    if (!name || !phone) return res.status(400).json({ error: '姓名和手机号必填' });

    const existing = await get('SELECT id FROM drivers WHERE phone = ?', [phone]);
    if (existing) return res.status(400).json({ error: '该手机号已注册' });

    const result = await run(
      `INSERT INTO drivers (name, phone, password, license_no, qualification_no, status, rating, total_orders)
       VALUES (?, ?, '123456', ?, ?, 'active', 5.0, 0)`,
      [name, phone, license_no || '', qualification_no || '']
    );
    res.json({ success: true, message: '司机添加成功', id: result.lastInsertRowid });
  } catch (error) {
    console.error('添加司机错误:', error);
    res.status(500).json({ error: '添加失败' });
  }
});

// 编辑司机
router.put('/drivers/:id', adminAuth, async (req, res) => {
  try {
    const { name, phone, license_no, qualification_no } = req.body;
    await run('UPDATE drivers SET name = ?, phone = ?, license_no = ?, qualification_no = ? WHERE id = ?',
      [name, phone, license_no || '', qualification_no || '', req.params.id]);
    res.json({ success: true, message: '修改成功' });
  } catch (error) {
    res.status(500).json({ error: '修改失败' });
  }
});

router.put('/drivers/:id/approve', adminAuth, async (req, res) => {
  try {
    await run('UPDATE drivers SET status = ? WHERE id = ?', ['active', req.params.id]);
    res.json({ success: true, message: '司机已审核通过' });
  } catch (error) {
    res.status(500).json({ error: '审核失败' });
  }
});

router.put('/drivers/:id/reject', adminAuth, async (req, res) => {
  try {
    await run('UPDATE drivers SET status = ? WHERE id = ?', ['offline', req.params.id]);
    res.json({ success: true, message: '已拒绝' });
  } catch (error) {
    res.status(500).json({ error: '操作失败' });
  }
});

router.put('/drivers/:id/toggle-status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'offline'].includes(status)) return res.status(400).json({ error: '状态无效' });
    await run('UPDATE drivers SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true, message: `司机已${status === 'active' ? '激活' : '下线'}` });
  } catch (error) {
    res.status(500).json({ error: '操作失败' });
  }
});

// 删除司机
router.delete('/drivers/:id', adminAuth, async (req, res) => {
  try {
    const hasOrders = await get('SELECT COUNT(*) as count FROM orders WHERE driver_id = ?', [req.params.id]);
    if (hasOrders && hasOrders.count > 0) {
      return res.status(400).json({ error: '该司机有历史订单，无法删除，请下线处理' });
    }
    await run('DELETE FROM drivers WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '司机已删除' });
  } catch (error) {
    res.status(500).json({ error: '删除失败' });
  }
});

router.get('/dispatch/available-drivers', adminAuth, async (req, res) => {
  try {
    const drivers = await all(`
      SELECT id, name, phone, rating, status, license_no, qualification_no, total_orders
      FROM drivers WHERE status = 'active' ORDER BY rating DESC, total_orders DESC
    `);
    const busyDrivers = await all("SELECT DISTINCT driver_id FROM orders WHERE status = 'processing' AND driver_id IS NOT NULL");
    const busyIds = busyDrivers.map(d => d.driver_id);
    res.json({
      drivers: drivers.map(d => ({
        id: d.id, name: d.name, phone: d.phone, rating: d.rating,
        license_no: d.license_no, qualification_no: d.qualification_no,
        total_orders: d.total_orders || 0,
        status: busyIds.includes(d.id) ? '服务中' : '空闲'
      }))
    });
  } catch (error) {
    res.status(500).json({ error: '获取司机列表失败' });
  }
});

// ==================== 车辆管理 ====================
router.get('/vehicles', adminAuth, async (req, res) => {
  try {
    const { keyword, status, type } = req.query;
    let query = 'SELECT v.*, d.name as driver_name FROM vehicles v LEFT JOIN drivers d ON v.driver_id = d.id WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND v.status = ?';
      params.push(status);
    }
    if (type && type !== 'all') {
      query += ' AND v.type = ?';
      params.push(type);
    }
    if (keyword) {
      query += ' AND (v.plate_no LIKE ? OR v.model LIKE ? OR v.device_no LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    query += ' ORDER BY v.created_at DESC';
    const vehicles = await all(query, params);

    res.json({
      vehicles: vehicles.map(v => ({
        id: v.id,
        plate_no: v.plate_no,
        model: v.model,
        type: v.type,
        type_text: v.type === 'tow' ? '拖车' : v.type === 'flatbed' ? '平板车' : v.type === 'crane' ? '吊车' : '其他',
        device_no: v.device_no,
        insurance_no: v.insurance_no,
        insurance_expiry: v.insurance_expiry,
        inspection_expiry: v.inspection_expiry,
        mileage: v.mileage || 0,
        status: v.status,
        status_text: v.status === 'active' ? '正常' : v.status === 'maintenance' ? '维修中' : '已报废',
        driver_id: v.driver_id,
        driver_name: v.driver_name || '',
        created_at: v.created_at
      }))
    });
  } catch (error) {
    console.error('获取车辆列表错误:', error);
    res.status(500).json({ error: '获取车辆列表失败' });
  }
});

// 添加车辆
router.post('/vehicles', adminAuth, async (req, res) => {
  try {
    const { plate_no, model, type, device_no, insurance_no, driver_id } = req.body;
    if (!plate_no) return res.status(400).json({ error: '车牌号必填' });

    const existing = await get('SELECT id FROM vehicles WHERE plate_no = ?', [plate_no]);
    if (existing) return res.status(400).json({ error: '该车牌号已存在' });

    const result = await run(
      `INSERT INTO vehicles (plate_no, model, type, device_no, insurance_no, driver_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [plate_no, model || '', type || 'tow', device_no || '', insurance_no || '', driver_id || null]
    );

    // 如果关联了司机，更新 drivers 表的 vehicle_id
    if (driver_id) {
      await run('UPDATE drivers SET vehicle_id = ? WHERE id = ?', [result.lastInsertRowid, driver_id]);
    }

    res.json({ success: true, message: '车辆添加成功', id: result.lastInsertRowid });
  } catch (error) {
    console.error('添加车辆错误:', error);
    res.status(500).json({ error: '添加失败' });
  }
});

// 编辑车辆
router.put('/vehicles/:id', adminAuth, async (req, res) => {
  try {
    const { plate_no, model, type, device_no, insurance_no, insurance_expiry, inspection_expiry, driver_id, status, mileage } = req.body;
    await run(`
      UPDATE vehicles SET plate_no = ?, model = ?, type = ?, device_no = ?, insurance_no = ?,
        insurance_expiry = ?, inspection_expiry = ?, driver_id = ?, status = ?, mileage = ?
      WHERE id = ?
    `, [plate_no, model || '', type || 'tow', device_no || '', insurance_no || '',
        insurance_expiry || null, inspection_expiry || null, driver_id || null, status || 'active', mileage || 0, req.params.id]);
    res.json({ success: true, message: '修改成功' });
  } catch (error) {
    res.status(500).json({ error: '修改失败' });
  }
});

// 删除车辆
router.delete('/vehicles/:id', adminAuth, async (req, res) => {
  try {
    const hasOrders = await get('SELECT COUNT(*) as count FROM orders WHERE rescue_vehicle_plate IN (SELECT plate_no FROM vehicles WHERE id = ?)', [req.params.id]);
    if (hasOrders && hasOrders.count > 0) {
      return res.status(400).json({ error: '该车辆有历史订单，无法删除，请设为报废' });
    }
    await run('DELETE FROM vehicles WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '车辆已删除' });
  } catch (error) {
    res.status(500).json({ error: '删除失败' });
  }
});

// 车辆导出 CSV
router.get('/vehicles/export', adminAuth, async (req, res) => {
  try {
    const vehicles = await all('SELECT v.*, d.name as driver_name FROM vehicles v LEFT JOIN drivers d ON v.driver_id = d.id ORDER BY v.created_at DESC');
    const typeMap = { tow: '拖车', flatbed: '平板车', crane: '吊车' };
    const statusMap = { active: '正常', maintenance: '维修中', retired: '已报废' };

    const BOM = '\uFEFF';
    let csv = BOM + '车牌号,车型,类型,设备编号,保险单号,保险到期,年检到期,里程,状态,关联司机,创建时间\n';
    vehicles.forEach(v => {
      csv += `"${v.plate_no}","${v.model || ''}","${typeMap[v.type] || v.type}","${v.device_no || ''}","${v.insurance_no || ''}","${v.insurance_expiry || ''}","${v.inspection_expiry || ''}","${v.mileage || 0}","${statusMap[v.status] || v.status}","${v.driver_name || ''}","${v.created_at}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=vehicles_${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: '导出失败' });
  }
});

// ==================== 客户管理（机构端） ====================
router.get('/customers', adminAuth, async (req, res) => {
  try {
    const { keyword } = req.query;
    let query = 'SELECT * FROM customers WHERE 1=1';
    const params = [];
    if (keyword) {
      query += ' AND (name LIKE ? OR contact_name LIKE ? OR contact_phone LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    query += ' ORDER BY created_at DESC';
    const customers = await all(query, params);

    // 为每个客户统计订单数
    const result = [];
    for (const c of customers) {
      const stats = await get('SELECT COUNT(*) as count FROM orders WHERE channel != ? AND owner_phone = ?',
        ['personal', c.contact_phone || '']);
      result.push({
        id: c.id,
        name: c.name,
        contact_name: c.contact_name,
        contact_phone: c.contact_phone,
        address: c.address,
        default_destination: c.default_destination,
        order_count: stats?.count || 0,
        created_at: c.created_at
      });
    }

    res.json({ customers: result });
  } catch (error) {
    console.error('获取客户列表错误:', error);
    res.status(500).json({ error: '获取客户列表失败' });
  }
});

// 添加客户
router.post('/customers', adminAuth, async (req, res) => {
  try {
    const { name, contact_name, contact_phone, address, default_destination } = req.body;
    if (!name) return res.status(400).json({ error: '客户名称必填' });

    const result = await run(
      `INSERT INTO customers (name, contact_name, contact_phone, address, default_destination) VALUES (?, ?, ?, ?, ?)`,
      [name, contact_name || '', contact_phone || '', address || '', default_destination || '']
    );
    res.json({ success: true, message: '客户添加成功', id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: '添加失败' });
  }
});

// 编辑客户
router.put('/customers/:id', adminAuth, async (req, res) => {
  try {
    const { name, contact_name, contact_phone, address, default_destination } = req.body;
    await run('UPDATE customers SET name = ?, contact_name = ?, contact_phone = ?, address = ?, default_destination = ? WHERE id = ?',
      [name, contact_name || '', contact_phone || '', address || '', default_destination || '', req.params.id]);
    res.json({ success: true, message: '修改成功' });
  } catch (error) {
    res.status(500).json({ error: '修改失败' });
  }
});

// 删除客户
router.delete('/customers/:id', adminAuth, async (req, res) => {
  try {
    await run('DELETE FROM customers WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '客户已删除' });
  } catch (error) {
    res.status(500).json({ error: '删除失败' });
  }
});

// ==================== 用户管理 ====================
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { keyword } = req.query;
    let query = `
      SELECT 
        id, username, phone, balance, points, level, created_at,
        (SELECT COUNT(*) FROM orders WHERE user_id = users.id) as order_count,
        (SELECT SUM(price) FROM orders WHERE user_id = users.id AND status = 'completed') as total_spent
      FROM users WHERE 1=1
    `;
    const params = [];
    if (keyword) {
      query += ' AND (username LIKE ? OR phone LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    query += ' ORDER BY created_at DESC';

    const users = await all(query, params);
    res.json({
      users: users.map(u => ({
        id: u.id,
        username: u.username,
        phone: u.phone,
        balance: u.balance || 0,
        points: u.points || 0,
        level: u.level || '普通会员',
        orders: u.order_count || 0,
        total_spent: u.total_spent || 0,
        created_at: u.created_at
      }))
    });
  } catch (error) {
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 用户详情
router.get('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await get('SELECT id, username, phone, balance, points, level, created_at FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const stats = await get('SELECT COUNT(*) as total_orders, COALESCE(SUM(price),0) as total_spent FROM orders WHERE user_id = ? AND status = ?', [req.params.id, 'completed']);
    const recentOrders = await all('SELECT id, order_no, status, price, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', [req.params.id]);

    res.json({
      user: {
        ...user,
        total_orders: stats?.total_orders || 0,
        total_spent: stats?.total_spent || 0,
        recent_orders: recentOrders
      }
    });
  } catch (error) {
    res.status(500).json({ error: '获取用户详情失败' });
  }
});

// 调整用户余额
router.put('/users/:id/balance', adminAuth, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    if (!amount || isNaN(amount)) return res.status(400).json({ error: '金额无效' });

    const user = await get('SELECT balance FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const newBalance = (user.balance || 0) + parseFloat(amount);
    if (newBalance < 0) return res.status(400).json({ error: '余额不足' });

    await run('UPDATE users SET balance = ? WHERE id = ?', [newBalance, req.params.id]);

    if (parseFloat(amount) > 0) {
      await run("INSERT INTO recharge_records (user_id, amount, bonus, status) VALUES (?, ?, 0, 'completed')",
        [req.params.id, parseFloat(amount)]);
    }

    res.json({ success: true, message: `余额已${parseFloat(amount) > 0 ? '增加' : '减少'} ¥${Math.abs(parseFloat(amount))}`, new_balance: newBalance });
  } catch (error) {
    res.status(500).json({ error: '操作失败' });
  }
});

// 用户导出
router.get('/users/export', adminAuth, async (req, res) => {
  try {
    const users = await all(`
      SELECT u.*, 
        (SELECT COUNT(*) FROM orders WHERE user_id = u.id) as order_count,
        (SELECT COALESCE(SUM(price),0) FROM orders WHERE user_id = u.id AND status = 'completed') as total_spent
      FROM users u ORDER BY u.created_at DESC
    `);
    const BOM = '\uFEFF';
    let csv = BOM + 'ID,用户名,手机号,余额,积分,等级,订单数,总消费,注册时间\n';
    users.forEach(u => {
      csv += `"${u.id}","${u.username}","${u.phone || ''}","${u.balance || 0}","${u.points || 0}","${u.level || ''}","${u.order_count || 0}","${u.total_spent || 0}","${u.created_at}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=users_${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: '导出失败' });
  }
});

// ==================== 财务报表 ====================
router.get('/finance/report', adminAuth, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    let dateFilter = '';
    const params = [];
    if (start_date) {
      dateFilter += ' AND DATE(created_at) >= DATE(?)';
      params.push(start_date);
    }
    if (end_date) {
      dateFilter += ' AND DATE(created_at) <= DATE(?)';
      params.push(end_date);
    }

    const revenue = await get(`SELECT SUM(price) as total FROM orders WHERE status = 'completed' ${dateFilter}`, params);
    const orderCount = await get(`SELECT COUNT(*) as count FROM orders WHERE status = 'completed' ${dateFilter}`, params);
    const avgPrice = await get(`SELECT AVG(price) as avg FROM orders WHERE status = 'completed' ${dateFilter}`, params);
    const totalAll = await get(`SELECT COUNT(*) as count FROM orders WHERE 1=1 ${dateFilter}`, params);
    const cancelledCount = await get(`SELECT COUNT(*) as count FROM orders WHERE status = 'cancelled' ${dateFilter}`, params);

    // 按渠道统计
    const channelStats = await all(`
      SELECT channel, COUNT(*) as count, SUM(price) as revenue
      FROM orders WHERE status = 'completed' ${dateFilter}
      GROUP BY channel
    `, params);

    const dailyStats = await all(`
      SELECT DATE(created_at) as date, 
        COUNT(*) as orders, 
        SUM(CASE WHEN status = 'completed' THEN price ELSE 0 END) as revenue,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM orders WHERE 1=1 ${dateFilter}
      GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30
    `, params);

    res.json({
      totalRevenue: revenue?.total || 0,
      totalOrders: orderCount?.count || 0,
      avgPrice: avgPrice?.avg || 0,
      totalAllOrders: totalAll?.count || 0,
      cancelledOrders: cancelledCount?.count || 0,
      channelStats: channelStats || [],
      dailyStats: dailyStats || []
    });
  } catch (error) {
    console.error('获取财务报表错误:', error);
    res.status(500).json({ error: '获取财务报表失败' });
  }
});

// 财务导出
router.get('/finance/export', adminAuth, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let dateFilter = '';
    const params = [];
    if (start_date) { dateFilter += ' AND DATE(created_at) >= DATE(?)'; params.push(start_date); }
    if (end_date) { dateFilter += ' AND DATE(created_at) <= DATE(?)'; params.push(end_date); }

    const dailyStats = await all(`
      SELECT DATE(created_at) as date, COUNT(*) as orders,
        SUM(CASE WHEN status = 'completed' THEN price ELSE 0 END) as revenue,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM orders WHERE 1=1 ${dateFilter}
      GROUP BY DATE(created_at) ORDER BY date
    `, params);

    const BOM = '\uFEFF';
    let csv = BOM + '日期,总订单,完成订单,收入\n';
    dailyStats.forEach(s => {
      csv += `"${s.date}","${s.orders}","${s.completed}","${s.revenue || 0}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=finance_${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: '导出失败' });
  }
});

// ==================== 评价管理 ====================
router.get('/ratings', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 50, driver_id, rating_filter } = req.query;
    
    let query = `
      SELECT r.*, o.order_no, o.driver_id, o.user_id, o.current_location, o.destination,
        d.name as driver_name, d.phone as driver_phone, u.username as user_name
      FROM order_ratings r
      JOIN orders o ON r.order_id = o.id
      LEFT JOIN drivers d ON o.driver_id = d.id
      LEFT JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    if (driver_id) { query += ' AND r.driver_id = ?'; params.push(driver_id); }
    if (rating_filter) { query += ' AND r.user_rating = ?'; params.push(parseInt(rating_filter)); }

    // 总数
    const countResult = await get(`SELECT COUNT(*) as total FROM order_ratings r JOIN orders o ON r.order_id = o.id WHERE 1=1`, []);

    query += ' ORDER BY r.user_rating_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const ratings = await all(query, params);

    res.json({
      ratings: ratings.map(r => ({
        id: r.id, order_id: r.order_id, order_no: r.order_no,
        driver_id: r.driver_id, driver_name: r.driver_name || '未知司机', driver_phone: r.driver_phone || '',
        user_id: r.user_id, user_name: r.user_name || '匿名用户',
        rating: r.user_rating, comment: r.user_comment, created_at: r.user_rating_at
      })),
      total: countResult?.total || 0, page: parseInt(page), limit: parseInt(limit)
    });
  } catch (error) {
    console.error('获取评价列表错误:', error);
    res.status(500).json({ error: '获取评价列表失败' });
  }
});

router.get('/ratings/:id', adminAuth, async (req, res) => {
  try {
    const rating = await get(`
      SELECT r.*, o.order_no, o.current_location, o.destination,
        d.name as driver_name, d.phone as driver_phone, u.username as user_name
      FROM order_ratings r JOIN orders o ON r.order_id = o.id
      LEFT JOIN drivers d ON o.driver_id = d.id LEFT JOIN users u ON o.user_id = u.id
      WHERE r.id = ?
    `, [req.params.id]);
    if (!rating) return res.status(404).json({ error: '评价不存在' });
    res.json({
      rating: {
        id: rating.id, order_id: rating.order_id, order_no: rating.order_no,
        driver_id: rating.driver_id, driver_name: rating.driver_name, driver_phone: rating.driver_phone,
        user_id: rating.user_id, user_name: rating.user_name,
        rating: rating.user_rating, comment: rating.user_comment,
        location: rating.current_location, destination: rating.destination, created_at: rating.user_rating_at
      }
    });
  } catch (error) {
    res.status(500).json({ error: '获取评价详情失败' });
  }
});

router.delete('/ratings/:id', adminAuth, async (req, res) => {
  try {
    const existing = await get('SELECT * FROM order_ratings WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: '评价不存在' });
    await run('DELETE FROM order_ratings WHERE id = ?', [req.params.id]);
    if (existing.driver_id) {
      const avgResult = await get('SELECT AVG(user_rating) as avg_rating FROM order_ratings WHERE driver_id = ? AND user_rating IS NOT NULL', [existing.driver_id]);
      const newRating = avgResult && avgResult.avg_rating ? Math.round(avgResult.avg_rating * 10) / 10 : 5.0;
      await run('UPDATE drivers SET rating = ? WHERE id = ?', [newRating, existing.driver_id]);
    }
    res.json({ success: true, message: '评价已删除' });
  } catch (error) {
    res.status(500).json({ error: '删除评价失败' });
  }
});

// 评价导出
router.get('/ratings/export', adminAuth, async (req, res) => {
  try {
    const ratings = await all(`
      SELECT r.*, o.order_no, d.name as driver_name, u.username as user_name
      FROM order_ratings r JOIN orders o ON r.order_id = o.id
      LEFT JOIN drivers d ON o.driver_id = d.id LEFT JOIN users u ON o.user_id = u.id
      ORDER BY r.user_rating_at DESC
    `);
    const BOM = '\uFEFF';
    let csv = BOM + '订单号,用户,司机,评分,评价内容,评价时间\n';
    ratings.forEach(r => {
      csv += `"${r.order_no}","${r.user_name || '匿名'}","${r.driver_name || '未知'}","${r.user_rating}","${(r.user_comment || '').replace(/"/g, '""')}","${r.user_rating_at || ''}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=ratings_${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: '导出失败' });
  }
});

// ==================== 评价审核 ====================
router.put('/ratings/:id/audit', adminAuth, async (req, res) => {
  try {
    const { action, reason } = req.body; // action: 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '操作无效' });
    const existing = await get('SELECT * FROM order_ratings WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: '评价不存在' });
    const auditStatus = action === 'approve' ? 'approved' : 'rejected';
    await run('UPDATE order_ratings SET audit_status = ?, audit_reason = ?, audited_at = CURRENT_TIMESTAMP WHERE id = ?',
      [auditStatus, reason || '', req.params.id]);
    res.json({ success: true, message: action === 'approve' ? '评价已审核通过' : '评价已驳回' });
  } catch (error) {
    res.status(500).json({ error: '审核失败' });
  }
});

// ==================== 司机评价统计 ====================
router.get('/drivers/:id/ratings/stats', adminAuth, async (req, res) => {
  try {
    const stats = await get(`
      SELECT COUNT(*) as total_ratings, AVG(user_rating) as avg_rating,
        SUM(CASE WHEN user_rating = 5 THEN 1 ELSE 0 END) as five_star,
        SUM(CASE WHEN user_rating = 4 THEN 1 ELSE 0 END) as four_star,
        SUM(CASE WHEN user_rating = 3 THEN 1 ELSE 0 END) as three_star,
        SUM(CASE WHEN user_rating = 2 THEN 1 ELSE 0 END) as two_star,
        SUM(CASE WHEN user_rating = 1 THEN 1 ELSE 0 END) as one_star
      FROM order_ratings WHERE driver_id = ? AND user_rating IS NOT NULL
    `, [req.params.id]);
    res.json({
      stats: {
        total: stats?.total_ratings || 0, average: stats?.avg_rating || 0,
        distribution: { 5: stats?.five_star || 0, 4: stats?.four_star || 0, 3: stats?.three_star || 0, 2: stats?.two_star || 0, 1: stats?.one_star || 0 }
      }
    });
  } catch (error) {
    res.status(500).json({ error: '获取评价统计失败' });
  }
});

// ==================== 商户管理 ====================
router.get('/merchants', adminAuth, async (req, res) => {
  try {
    const { keyword, status } = req.query;
    let query = 'SELECT * FROM merchants WHERE 1=1';
    const params = [];
    if (status && status !== 'all') { query += ' AND status = ?'; params.push(status); }
    if (keyword) { query += ' AND (name LIKE ? OR contact_name LIKE ? OR license_no LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
    query += ' ORDER BY created_at DESC';
    const merchants = await all(query, params);
    res.json({ merchants });
  } catch (error) { res.status(500).json({ error: '获取商户列表失败' }); }
});

router.post('/merchants', adminAuth, async (req, res) => {
  try {
    const { name, license_no, contact_name, contact_phone, address, service_scope, contract_start, contract_end } = req.body;
    if (!name) return res.status(400).json({ error: '商户名称必填' });
    const result = await run(
      `INSERT INTO merchants (name, license_no, contact_name, contact_phone, address, service_scope, contract_start, contract_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, license_no || '', contact_name || '', contact_phone || '', address || '', service_scope || '', contract_start || null, contract_end || null]
    );
    res.json({ success: true, message: '商户添加成功', id: result.lastInsertRowid });
  } catch (error) { res.status(500).json({ error: '添加失败' }); }
});

router.put('/merchants/:id', adminAuth, async (req, res) => {
  try {
    const { name, license_no, contact_name, contact_phone, address, service_scope, contract_start, contract_end, status } = req.body;
    await run(`UPDATE merchants SET name=?, license_no=?, contact_name=?, contact_phone=?, address=?, service_scope=?, contract_start=?, contract_end=?, status=? WHERE id=?`,
      [name, license_no||'', contact_name||'', contact_phone||'', address||'', service_scope||'', contract_start||null, contract_end||null, status||'active', req.params.id]);
    res.json({ success: true, message: '修改成功' });
  } catch (error) { res.status(500).json({ error: '修改失败' }); }
});

router.delete('/merchants/:id', adminAuth, async (req, res) => {
  try {
    await run('DELETE FROM merchants WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '商户已删除' });
  } catch (error) { res.status(500).json({ error: '删除失败' }); }
});

router.get('/merchants/export', adminAuth, async (req, res) => {
  try {
    const merchants = await all('SELECT * FROM merchants ORDER BY created_at DESC');
    const statusMap = { active: '正常', inactive: '停用' };
    const BOM = '\uFEFF';
    let csv = BOM + '商户名称,营业执照,联系人,联系电话,地址,服务范围,合同开始,合同结束,状态,创建时间\n';
    merchants.forEach(m => {
      csv += `"${m.name}","${m.license_no||''}","${m.contact_name||''}","${m.contact_phone||''}","${(m.address||'').replace(/"/g,'""')}","${(m.service_scope||'').replace(/"/g,'""')}","${m.contract_start||''}","${m.contract_end||''}","${statusMap[m.status]||m.status}","${m.created_at}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=merchants_${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csv);
  } catch (error) { res.status(500).json({ error: '导出失败' }); }
});

// ==================== 消息通知管理 ====================
router.get('/notifications', adminAuth, async (req, res) => {
  try {
    const { type, user_type, page = 1, limit = 50 } = req.query;
    let query = 'SELECT * FROM notifications WHERE 1=1';
    const params = [];
    if (type) { query += ' AND type = ?'; params.push(type); }
    if (user_type && user_type === 'driver') { query += ' AND driver_id IS NOT NULL'; }
    else if (user_type && user_type === 'user') { query += ' AND user_id IS NOT NULL'; }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    const notifications = await all(query, params);
    const countResult = await get('SELECT COUNT(*) as total FROM notifications WHERE 1=1');
    res.json({ notifications, total: countResult?.total || 0, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) { res.status(500).json({ error: '获取通知列表失败' }); }
});

router.post('/notifications', adminAuth, async (req, res) => {
  try {
    const { user_id, driver_id, type, title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: '标题和内容必填' });
    const result = await run(
      'INSERT INTO notifications (user_id, driver_id, type, title, content) VALUES (?, ?, ?, ?, ?)',
      [user_id || null, driver_id || null, type || 'system', title, content]
    );
    res.json({ success: true, message: '通知发送成功', id: result.lastInsertRowid });
  } catch (error) { res.status(500).json({ error: '发送失败' }); }
});

router.post('/notifications/broadcast', adminAuth, async (req, res) => {
  try {
    const { target, type, title, content } = req.body; // target: 'all_users' | 'all_drivers' | 'all'
    if (!title || !content) return res.status(400).json({ error: '标题和内容必填' });
    let count = 0;
    if (target === 'all_users' || target === 'all') {
      const users = await all('SELECT id FROM users');
      for (const u of users) {
        await run('INSERT INTO notifications (user_id, type, title, content) VALUES (?, ?, ?, ?)', [u.id, type || 'system', title, content]);
        count++;
      }
    }
    if (target === 'all_drivers' || target === 'all') {
      const drivers = await all("SELECT id FROM drivers WHERE status = 'active'");
      for (const d of drivers) {
        await run('INSERT INTO notifications (driver_id, type, title, content) VALUES (?, ?, ?, ?)', [d.id, type || 'system', title, content]);
        count++;
      }
    }
    res.json({ success: true, message: `已发送 ${count} 条通知` });
  } catch (error) { res.status(500).json({ error: '群发失败' }); }
});

router.delete('/notifications/:id', adminAuth, async (req, res) => {
  try {
    await run('DELETE FROM notifications WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '通知已删除' });
  } catch (error) { res.status(500).json({ error: '删除失败' }); }
});

// ==================== 配置中心 ====================
router.get('/config', adminAuth, async (req, res) => {
  try {
    const configs = await all('SELECT * FROM system_config ORDER BY id');
    res.json({ configs });
  } catch (error) { res.status(500).json({ error: '获取配置失败' }); }
});

router.put('/config/:key', adminAuth, async (req, res) => {
  try {
    const { config_value } = req.body;
    await run('UPDATE system_config SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE config_key = ?',
      [config_value, req.params.key]);
    res.json({ success: true, message: '配置已更新' });
  } catch (error) { res.status(500).json({ error: '更新失败' }); }
});

router.post('/config', adminAuth, async (req, res) => {
  try {
    const { config_key, config_value } = req.body;
    if (!config_key) return res.status(400).json({ error: '配置键名必填' });
    await run('INSERT OR REPLACE INTO system_config (config_key, config_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [config_key, config_value || '']);
    res.json({ success: true, message: '配置已保存' });
  } catch (error) { res.status(500).json({ error: '保存失败' }); }
});

// 拍照模板
router.get('/config/templates', adminAuth, async (req, res) => {
  try {
    const templates = await all('SELECT * FROM config_templates ORDER BY type, id');
    res.json({ templates });
  } catch (error) { res.status(500).json({ error: '获取模板失败' }); }
});

router.post('/config/templates', adminAuth, async (req, res) => {
  try {
    const { type, name, content, is_active } = req.body;
    if (!type || !name) return res.status(400).json({ error: '类型和名称必填' });
    const result = await run('INSERT INTO config_templates (type, name, content, is_active) VALUES (?, ?, ?, ?)',
      [type, name, content || '', is_active !== undefined ? is_active : 1]);
    res.json({ success: true, message: '模板添加成功', id: result.lastInsertRowid });
  } catch (error) { res.status(500).json({ error: '添加失败' }); }
});

router.put('/config/templates/:id', adminAuth, async (req, res) => {
  try {
    const { type, name, content, is_active } = req.body;
    await run('UPDATE config_templates SET type=?, name=?, content=?, is_active=? WHERE id=?',
      [type, name, content||'', is_active !== undefined ? is_active : 1, req.params.id]);
    res.json({ success: true, message: '模板已更新' });
  } catch (error) { res.status(500).json({ error: '更新失败' }); }
});

router.delete('/config/templates/:id', adminAuth, async (req, res) => {
  try {
    await run('DELETE FROM config_templates WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '模板已删除' });
  } catch (error) { res.status(500).json({ error: '删除失败' }); }
});

// 短信模板配置
router.get('/config/sms-templates', adminAuth, async (req, res) => {
  try {
    const templates = await all("SELECT * FROM config_templates WHERE type = 'sms' ORDER BY id");
    res.json({ templates });
  } catch (error) { res.status(500).json({ error: '获取短信模板失败' }); }
});

// ==================== 审批管理 ====================
router.get('/approvals', adminAuth, async (req, res) => {
  try {
    const { type, status, page = 1, limit = 50 } = req.query;
    let query = 'SELECT vm.*, v.plate_no, v.model, d.name as applicant_name FROM vehicle_maintenance vm LEFT JOIN vehicles v ON vm.vehicle_id = v.id LEFT JOIN drivers d ON vm.applicant_id = d.id WHERE 1=1';
    const params = [];
    if (type) { query += ' AND vm.type = ?'; params.push(type); }
    if (status && status !== 'all') { query += ' AND vm.status = ?'; params.push(status); }
    query += ' ORDER BY vm.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    const approvals = await all(query, params);
    const countResult = await get('SELECT COUNT(*) as total FROM vehicle_maintenance WHERE 1=1');
    res.json({ approvals, total: countResult?.total || 0, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) { res.status(500).json({ error: '获取审批列表失败' }); }
});

router.put('/approvals/:id', adminAuth, async (req, res) => {
  try {
    const { action, reason } = req.body; // action: 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '操作无效' });
    const existing = await get('SELECT * FROM vehicle_maintenance WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: '记录不存在' });
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await run('UPDATE vehicle_maintenance SET status = ?, approved_by = ?, approved_reason = ? WHERE id = ?',
      [newStatus, req.admin.username, reason || '', req.params.id]);
    res.json({ success: true, message: action === 'approve' ? '已审批通过' : '已驳回' });
  } catch (error) { res.status(500).json({ error: '审批失败' }); }
});

// ==================== 异常处理 ====================
router.put('/orders/:id/intervene', adminAuth, async (req, res) => {
  try {
    const { action, reason, new_driver_id } = req.body; // action: 'reassign' | 'force_cancel' | 'force_complete'
    const order = await get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: '订单不存在' });

    if (action === 'reassign' && new_driver_id) {
      const driver = await get('SELECT * FROM drivers WHERE id = ?', [new_driver_id]);
      if (!driver) return res.status(404).json({ error: '司机不存在' });
      await run(`UPDATE orders SET driver_id=?, driver_name=?, driver_phone=?, driver_rating=?, status='processing' WHERE id=?`,
        [driver.id, driver.name, driver.phone, driver.rating, req.params.id]);
      await run('INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
        [req.params.id, 'processing', `异常干预：重新派单给 ${driver.name}，原因：${reason || '无'}`]);
    } else if (action === 'force_cancel') {
      await run("UPDATE orders SET status = 'cancelled' WHERE id = ?", [req.params.id]);
      await run('INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
        [req.params.id, 'cancelled', `异常干预：强制取消订单，原因：${reason || '无'}`]);
    } else if (action === 'force_complete') {
      await run("UPDATE orders SET status = 'completed' WHERE id = ?", [req.params.id]);
      await run('INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
        [req.params.id, 'completed', `异常干预：强制完成订单，原因：${reason || '无'}`]);
    } else {
      return res.status(400).json({ error: '操作无效' });
    }
    res.json({ success: true, message: '异常处理完成' });
  } catch (error) { res.status(500).json({ error: '异常处理失败' }); }
});

// ==================== 订单归档 ====================
router.post('/orders/archive', adminAuth, async (req, res) => {
  try {
    const { days = 90 } = req.body;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const result = await run(
      "UPDATE orders SET archived = 1 WHERE status IN ('completed', 'cancelled') AND created_at < ? AND (archived IS NULL OR archived = 0)",
      [cutoff]
    );
    res.json({ success: true, message: `已归档 ${result.changes || 0} 条订单` });
  } catch (error) {
    // archived 字段可能不存在，先添加
    try {
      const sqlite3 = require('sqlite3').verbose();
      const path = require('path');
      const dbPath = path.join(__dirname, '../config/rescue.db');
      const db = new sqlite3.Database(dbPath);
      db.run('ALTER TABLE orders ADD COLUMN archived INTEGER DEFAULT 0', (err) => {
        db.close();
      });
      res.json({ success: true, message: '归档字段已添加，请重新执行' });
    } catch (e2) {
      res.status(500).json({ error: '归档失败' });
    }
  }
});

router.get('/orders/archived', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    let query = "SELECT * FROM orders WHERE archived = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?";
    const orders = await all(query, [parseInt(limit), (parseInt(page) - 1) * parseInt(limit)]);
    const countResult = await get("SELECT COUNT(*) as total FROM orders WHERE archived = 1");
    res.json({ orders, total: countResult?.total || 0 });
  } catch (error) {
    res.json({ orders: [], total: 0 });
  }
});

// ==================== 角色权限管理 (RBAC) ====================
// 简化版 RBAC：基于角色+权限列表
router.get('/roles', adminAuth, async (req, res) => {
  try {
    const roles = await all('SELECT * FROM system_config WHERE config_key LIKE "role_%" ORDER BY id');
    res.json({ roles });
  } catch (error) { res.status(500).json({ error: '获取角色列表失败' }); }
});

router.post('/roles', adminAuth, async (req, res) => {
  try {
    const { name, permissions } = req.body; // permissions: JSON string array
    if (!name) return res.status(400).json({ error: '角色名称必填' });
    const key = 'role_' + name.replace(/\s/g, '_');
    await run('INSERT OR REPLACE INTO system_config (config_key, config_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, JSON.stringify({ name, permissions: permissions || [] })]);
    res.json({ success: true, message: '角色已创建' });
  } catch (error) { res.status(500).json({ error: '创建失败' }); }
});

router.delete('/roles/:key', adminAuth, async (req, res) => {
  try {
    await run("DELETE FROM system_config WHERE config_key = ?", ['role_' + req.params.key]);
    res.json({ success: true, message: '角色已删除' });
  } catch (error) { res.status(500).json({ error: '删除失败' }); }
});

// ==================== 日志审计 ====================
router.get('/audit-log', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    // 从 order_timeline 和其他表聚合操作日志
    const timelines = await all(
      'SELECT ot.*, o.order_no FROM order_timeline ot JOIN orders o ON ot.order_id = o.id ORDER BY ot.created_at DESC LIMIT ? OFFSET ?',
      [parseInt(limit), (parseInt(page) - 1) * parseInt(limit)]
    );
    const countResult = await get('SELECT COUNT(*) as total FROM order_timeline');
    res.json({ logs: timelines, total: countResult?.total || 0, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) { res.status(500).json({ error: '获取日志失败' }); }
});

// ==================== 短信网关 ====================
// 短信发送接口（预留，需要接入实际短信服务商如阿里云/腾讯云SMS）
router.post('/sms/send', adminAuth, async (req, res) => {
  try {
    const { phone, template_code, params } = req.body;
    if (!phone || !template_code) return res.status(400).json({ error: '手机号和模板编码必填' });

    // 读取短信网关配置
    const gatewayConfig = await get("SELECT config_value FROM system_config WHERE config_key = 'sms_gateway'");
    const gateway = gatewayConfig ? JSON.parse(gatewayConfig.config_value) : null;

    if (!gateway || !gateway.provider || !gateway.api_key) {
      // 未配置网关时，记录到通知表作为站内信
      await run('INSERT INTO notifications (type, title, content) VALUES (?, ?, ?)',
        ['sms_pending', '待发送短信', `手机号: ${phone}, 模板: ${template_code}, 参数: ${JSON.stringify(params || {})}`]);
      return res.json({ success: true, message: '短信网关未配置，已转为站内信', simulated: true });
    }

    // 实际发送逻辑（根据 provider 调用不同 API）
    // TODO: 接入阿里云/腾讯云 SMS SDK
    res.json({ success: true, message: '短信已发送（模拟）', simulated: true });
  } catch (error) { res.status(500).json({ error: '发送失败' }); }
});

// 配置短信网关
router.post('/sms/gateway', adminAuth, async (req, res) => {
  try {
    const { provider, api_key, api_secret, sign_name } = req.body;
    if (!provider || !api_key) return res.status(400).json({ error: '服务商和API Key必填' });
    await run('INSERT OR REPLACE INTO system_config (config_key, config_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      ['sms_gateway', JSON.stringify({ provider, api_key, api_secret: api_secret || '', sign_name: sign_name || '' })]);
    res.json({ success: true, message: '短信网关配置已保存' });
  } catch (error) { res.status(500).json({ error: '配置失败' }); }
});

// 获取短信网关配置
router.get('/sms/gateway', adminAuth, async (req, res) => {
  try {
    const config = await get("SELECT config_value FROM system_config WHERE config_key = 'sms_gateway'");
    if (config) {
      const gateway = JSON.parse(config.config_value);
      gateway.api_key = gateway.api_key ? gateway.api_key.slice(0, 6) + '****' : '';
      gateway.api_secret = gateway.api_secret ? '****' : '';
      res.json({ gateway });
    } else {
      res.json({ gateway: null });
    }
  } catch (error) { res.status(500).json({ error: '获取配置失败' }); }
});

// ==================== 实时监控（司机位置） ====================
router.get('/monitor/drivers', adminAuth, async (req, res) => {
  try {
    const drivers = await all(`
      SELECT d.id, d.name, d.phone, d.status, d.rating, d.latitude, d.longitude, d.last_location_update,
        d.accepting_orders,
        (SELECT COUNT(*) FROM orders WHERE driver_id = d.id AND status = 'processing') as active_orders
      FROM drivers d WHERE d.status = 'active'
      ORDER BY d.last_location_update DESC
    `);
    res.json({ drivers: drivers.map(d => ({
      ...d,
      is_online: d.last_location_update && (Date.now() - new Date(d.last_location_update).getTime() < 300000), // 5分钟内
      active_orders: d.active_orders || 0
    }))});
  } catch (error) { res.status(500).json({ error: '获取监控数据失败' }); }
});

// 仪表盘补充统计
router.get('/stats/realtime', adminAuth, async (req, res) => {
  try {
    const onlineDrivers = await get("SELECT COUNT(*) as count FROM drivers WHERE status = 'active' AND last_location_update > datetime('now', '-5 minutes')");
    const processingOrders = await all("SELECT id, order_no, driver_name, current_location, status, progress FROM orders WHERE status = 'processing' ORDER BY updated_at DESC LIMIT 20");
    const pendingOrders = await get("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
    const todayCompleted = await get("SELECT COUNT(*) as count FROM orders WHERE status = 'completed' AND DATE(created_at) = DATE('now')");
    const todayRevenue = await get("SELECT SUM(price) as total FROM orders WHERE status = 'completed' AND DATE(created_at) = DATE('now')");
    res.json({
      onlineDrivers: onlineDrivers?.count || 0,
      processingOrders,
      pendingOrders: pendingOrders?.count || 0,
      todayCompleted: todayCompleted?.count || 0,
      todayRevenue: todayRevenue?.total || 0
    });
  } catch (error) { res.status(500).json({ error: '获取实时数据失败' }); }
});

// ==================== 字典管理 ====================
router.get('/dict', adminAuth, async (req, res) => {
  try {
    const dicts = await all("SELECT * FROM system_config WHERE config_key LIKE 'dict_%' ORDER BY id");
    res.json({ dicts: dicts.map(d => ({ key: d.config_key, value: JSON.parse(d.config_value) })) });
  } catch (error) { res.status(500).json({ error: '获取字典失败' }); }
});

router.post('/dict', adminAuth, async (req, res) => {
  try {
    const { name, items } = req.body; // items: [{label, value}]
    if (!name) return res.status(400).json({ error: '字典名称必填' });
    const key = 'dict_' + name.replace(/\s/g, '_');
    await run('INSERT OR REPLACE INTO system_config (config_key, config_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, JSON.stringify({ name, items: items || [] })]);
    res.json({ success: true, message: '字典已保存' });
  } catch (error) { res.status(500).json({ error: '保存失败' }); }
});

module.exports = router;
