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

module.exports = router;
