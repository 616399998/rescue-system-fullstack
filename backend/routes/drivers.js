const express = require('express');
const router = express.Router();
const { run, all, get } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/drivers');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片文件'));
    }
  }
});

// ==================== 司机认证 ====================

// 司机登录
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    
    if (!phone || !password) {
      return res.status(400).json({ error: '手机号和密码不能为空' });
    }

    const driver = await get('SELECT * FROM drivers WHERE phone = ?', [phone]);
    
    if (!driver) {
      return res.status(401).json({ error: '司机账号不存在' });
    }

    if (driver.password !== password) {
      return res.status(401).json({ error: '密码错误' });
    }

    if (driver.status === 'offline') {
      return res.status(403).json({ error: '账号已下线，请联系管理员' });
    }

    res.json({
      success: true,
      token: 'driver_token_' + driver.id + '_' + Date.now(),
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        license_no: driver.license_no,
        qualification_no: driver.qualification_no,
        vehicle_id: driver.vehicle_id,
        rating: driver.rating,
        total_orders: driver.total_orders,
        status: driver.status
      }
    });
  } catch (error) {
    console.error('司机登录错误:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

// 司机注册
router.post('/register', async (req, res) => {
  try {
    const { name, phone, password, license_no, qualification_no } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ error: '必填信息不能为空' });
    }

    const existing = await get('SELECT * FROM drivers WHERE phone = ?', [phone]);
    if (existing) {
      return res.status(400).json({ error: '该手机号已注册' });
    }

    const result = await run(`
      INSERT INTO drivers (name, phone, password, license_no, qualification_no, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `, [name, phone, password, license_no || '', qualification_no || '']);

    res.json({
      success: true,
      message: '注册成功，可以直接登录',
      driverId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('司机注册错误:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

// ==================== 任务管理 ====================

// 获取我的任务列表
router.get('/tasks', async (req, res) => {
  try {
    const { driver_id, status, page = 1, limit = 20 } = req.query;
    
    let query = 'SELECT * FROM orders WHERE driver_id = ?';
    const params = [driver_id];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
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
        vehicle_plate: order.vehicle_plate,
        current_location: order.current_location,
        destination: order.destination,
        owner_name: order.owner_name,
        owner_phone: order.owner_phone,
        price: order.price,
        created_at: order.created_at,
        progress: order.progress
      };
    });

    res.json({ tasks: formattedOrders });
  } catch (error) {
    console.error('获取任务列表错误:', error);
    res.status(500).json({ error: '获取任务失败' });
  }
});

// 获取任务详情
router.get('/tasks/:id', async (req, res) => {
  try {
    const order = await get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    
    if (!order) {
      return res.status(404).json({ error: '任务不存在' });
    }

    const timeline = await all('SELECT * FROM order_timeline WHERE order_id = ? ORDER BY created_at', [order.id]);

    res.json({
      task: {
        id: order.id,
        order_no: order.order_no,
        status: order.status,
        service_type: order.service_type,
        vehicle_type: order.vehicle_type,
        vehicle_plate: order.vehicle_plate,
        vehicle_brand: order.vehicle_brand,
        vehicle_color: order.vehicle_color,
        current_location: order.current_location,
        destination: order.destination,
        address: order.address,
        problem_description: order.problem_description,
        owner_name: order.owner_name,
        owner_phone: order.owner_phone,
        movable: order.movable,
        special_note: order.special_note,
        photos: order.photos ? JSON.parse(order.photos) : [],
        price: order.price,
        priority: order.priority,
        insurance_no: order.insurance_no,
        created_at: order.created_at,
        timeline: timeline.map(t => ({
          time: new Date(t.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          content: t.description
        }))
      }
    });
  } catch (error) {
    console.error('获取任务详情错误:', error);
    res.status(500).json({ error: '获取任务失败' });
  }
});

// 任务确认/拒绝（新增 - 文档第 46 项）
router.put('/tasks/:id/confirm', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { accepted, reject_reason } = req.body;

    const order = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) {
      return res.status(404).json({ error: '任务不存在' });
    }

    if (!accepted) {
      // 拒绝任务
      await run('UPDATE orders SET driver_id = NULL, driver_name = NULL, driver_phone = NULL, status = ?, rejected_reason = ? WHERE id = ?', 
        ['pending', reject_reason || '', orderId]);
      
      await run(
        'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
        [orderId, 'pending', `司机拒绝任务：${reject_reason || '个人原因'}`]
      );

      res.json({ success: true, message: '已拒绝任务' });
    } else {
      // 确认任务
      await run(
        'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
        [orderId, 'processing', '司机已确认任务，准备出发']
      );

      res.json({ success: true, message: '任务已确认' });
    }
  } catch (error) {
    console.error('任务确认错误:', error);
    res.status(500).json({ error: '操作失败' });
  }
});

// 开始任务（出发）
router.put('/tasks/:id/start', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { latitude, longitude } = req.body;

    const order = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) {
      return res.status(404).json({ error: '任务不存在' });
    }

    await run('UPDATE orders SET progress = ?, navigation_started = 1 WHERE id = ?', [10, orderId]);

    await run(
      'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
      [orderId, 'processing', '司机已出发前往救援地点']
    );

    res.json({ success: true, message: '任务已开始' });
  } catch (error) {
    console.error('开始任务错误:', error);
    res.status(500).json({ error: '操作失败' });
  }
});

// 到达现场（新增 - 文档第 48 项）
router.put('/tasks/:id/arrive-site', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { photos } = req.body;

    const order = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) {
      return res.status(404).json({ error: '任务不存在' });
    }

    await run('UPDATE orders SET progress = ?, arrived_at_site = ? WHERE id = ?', [50, new Date().toISOString(), orderId]);

    let photoDesc = '';
    if (photos && photos.length > 0) {
      photoDesc = `，已上传现场照片 ${photos.length} 张`;
    }

    await run(
      'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
      [orderId, 'processing', `司机已到达现场${photoDesc}`]
    );

    res.json({ success: true, message: '已到达现场' });
  } catch (error) {
    console.error('到达现场错误:', error);
    res.status(500).json({ error: '操作失败' });
  }
});

// 到达目的地（新增 - 文档第 49 项）
router.put('/tasks/:id/arrive-dest', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { sign_photo, sign_user } = req.body;

    const order = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) {
      return res.status(404).json({ error: '任务不存在' });
    }

    await run('UPDATE orders SET progress = ?, arrived_at_dest = ?, sign_photo = ?, sign_user = ? WHERE id = ?', 
      [80, new Date().toISOString(), sign_photo || '', sign_user || '']);

    await run(
      'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
      [orderId, 'processing', '已到达目的地，等待签收确认']
    );

    res.json({ success: true, message: '已到达目的地' });
  } catch (error) {
    console.error('到达目的地错误:', error);
    res.status(500).json({ error: '操作失败' });
  }
});

// 完成任务
router.put('/tasks/:id/complete', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { tow_fee, mileage_fee, extra_fee, total_fee } = req.body;

    const order = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) {
      return res.status(404).json({ error: '任务不存在' });
    }

    await run(`
      UPDATE orders SET 
        tow_fee = ?, mileage_fee = ?, extra_fee = ?, total_fee = ?,
        status = 'completed', progress = 100
      WHERE id = ?
    `, [tow_fee, mileage_fee, extra_fee, total_fee || (tow_fee + mileage_fee), orderId]);

    await run(
      'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
      [orderId, 'completed', `任务已完成，总费用：¥${total_fee}`]
    );

    // 更新司机统计
    await run('UPDATE drivers SET total_orders = total_orders + 1 WHERE id = ?', [order.driver_id]);

    res.json({ success: true, message: '任务已完成' });
  } catch (error) {
    console.error('完成任务错误:', error);
    res.status(500).json({ error: '操作失败' });
  }
});

// ==================== 费用上报（新增 - 文档第 53 项）====================

// 提交费用
router.post('/tasks/:id/expense', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { type, amount, description, photos } = req.body;

    // type: oil/maintenance/extra
    await run(`
      INSERT INTO vehicle_maintenance (vehicle_id, type, description, cost, status)
      SELECT vehicle_id, ?, ?, ?, 'pending' FROM drivers WHERE id = (SELECT driver_id FROM orders WHERE id = ?)
    `, [type, description || '', amount, orderId]);

    res.json({ success: true, message: '费用已提交，等待审核' });
  } catch (error) {
    console.error('费用上报错误:', error);
    res.status(500).json({ error: '操作失败' });
  }
});

// ==================== 司机信息 ====================

// 获取司机信息
router.get('/profile/:id', async (req, res) => {
  try {
    const driver = await get('SELECT * FROM drivers WHERE id = ?', [req.params.id]);
    
    if (!driver) {
      return res.status(404).json({ error: '司机不存在' });
    }

    const vehicle = driver.vehicle_id ? await get('SELECT * FROM vehicles WHERE id = ?', [driver.vehicle_id]) : null;

    // 检查证照到期
    const today = new Date();
    const licenseExpiry = driver.license_expiry ? new Date(driver.license_expiry) : null;
    const qualificationExpiry = driver.qualification_expiry ? new Date(driver.qualification_expiry) : null;

    res.json({
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        license_no: driver.license_no,
        license_expiry: driver.license_expiry,
        license_expiring: licenseExpiry && (licenseExpiry - today) < 30 * 24 * 60 * 60 * 1000,
        qualification_no: driver.qualification_no,
        qualification_expiry: driver.qualification_expiry,
        qualification_expiring: qualificationExpiry && (qualificationExpiry - today) < 30 * 24 * 60 * 60 * 1000,
        vehicle: vehicle ? {
          plate_no: vehicle.plate_no,
          model: vehicle.model,
          type: vehicle.type
        } : null,
        rating: driver.rating,
        total_orders: driver.total_orders,
        status: driver.status
      }
    });
  } catch (error) {
    console.error('获取司机信息错误:', error);
    res.status(500).json({ error: '获取信息失败' });
  }
});

// 更新司机位置（用于实时追踪 - 文档第 73 项）
router.put('/profile/:id/location', async (req, res) => {
  try {
    const { latitude, longitude, speed, direction } = req.body;

    await run('UPDATE drivers SET latitude = ?, longitude = ?, last_location_update = ? WHERE id = ?', 
      [latitude, longitude, new Date().toISOString(), req.params.id]);

    // 记录位置历史
    const driver = await get('SELECT vehicle_id FROM drivers WHERE id = ?', [req.params.id]);
    if (driver && driver.vehicle_id) {
      await run('INSERT INTO vehicle_locations (vehicle_id, latitude, longitude, speed, direction) VALUES (?, ?, ?, ?, ?)',
        [driver.vehicle_id, latitude, longitude, speed || 0, direction || 0]);
    }

    res.json({ success: true, message: '位置已更新' });
  } catch (error) {
    console.error('更新位置错误:', error);
    res.status(500).json({ error: '操作失败' });
  }
});

// 切换接单状态（新增）
router.put('/profile/:id/toggle-accepting', async (req, res) => {
  try {
    const { accepting_orders } = req.body; // true/false

    await run('UPDATE drivers SET accepting_orders = ?, accepting_orders_updated_at = ? WHERE id = ?', 
      [accepting_orders ? 1 : 0, new Date().toISOString(), req.params.id]);

    const statusText = accepting_orders ? '已开启接单' : '已关闭接单';
    res.json({ success: true, message: statusText, accepting_orders: accepting_orders });
  } catch (error) {
    console.error('切换接单状态错误:', error);
    res.status(500).json({ error: '操作失败' });
  }
});

// 获取路线规划（腾讯地图 API 代理）
router.post('/route', async (req, res) => {
  try {
    const { from_lat, from_lng, to_lat, to_lng } = req.body;

    if (!from_lat || !from_lng || !to_lat || !to_lng) {
      return res.status(400).json({ error: '缺少起点或终点坐标' });
    }

    // 调用腾讯地图方向 API
    const tencentKey = '67MBZ-EF6RT-THAX4-VEGBL-7AYMJ-LGBXX';
    const url = `https://apis.map.qq.com/ws/direction/v1/driving/?from=${from_lat},${from_lng}&to=${to_lat},${to_lng}&key=${tencentKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 0) {
      res.json({
        success: true,
        route: data.result.routes[0],
        distance: data.result.routes[0].distance,
        duration: data.result.routes[0].duration
      });
    } else {
      res.status(500).json({ error: data.message || '路线规划失败' });
    }
  } catch (error) {
    console.error('路线规划错误:', error);
    res.status(500).json({ error: '路线规划失败' });
  }
});

// 上传照片（支持水印）
router.post('/upload', upload.array('photos', 9), (req, res) => {
  try {
    const files = req.files || [];
    const urls = files.map(file => `/uploads/drivers/${file.filename}`);
    res.json({ success: true, urls });
  } catch (error) {
    console.error('上传照片错误:', error);
    res.status(500).json({ error: '上传失败' });
  }
});

// 获取司机统计报表（新增 - 文档第 62 项）
router.get('/stats/:id', async (req, res) => {
  try {
    const { type = 'day' } = req.params;
    const driver = await get('SELECT * FROM drivers WHERE id = ?', [req.params.id]);
    
    if (!driver) {
      return res.status(404).json({ error: '司机不存在' });
    }

    const dateFormat = type === 'month' ? '%Y-%m' : '%Y-%m-%d';
    
    const stats = await all(`
      SELECT 
        strftime('${dateFormat}', created_at) as date,
        COUNT(*) as orders,
        SUM(CASE WHEN status = 'completed' THEN total_fee ELSE 0 END) as income
      FROM orders 
      WHERE driver_id = ?
      GROUP BY strftime('${dateFormat}', created_at)
      ORDER BY date DESC
      LIMIT 30
    `, [req.params.id]);

    res.json({ stats });
  } catch (error) {
    console.error('获取统计错误:', error);
    res.status(500).json({ error: '获取统计失败' });
  }
});

// 初始化模拟任务数据
router.post('/init-mock', async (req, res) => {
  try {
    const mockOrders = [
      {
        order_no: 'RW20260326001',
        service_type: 'accident',
        channel: 'personal',
        vehicle_plate: '京 P·11111',
        owner_name: '刘先生',
        owner_phone: '13800138011',
        current_location: '北京市朝阳区三里屯路 19 号',
        destination: '北京朝阳医院',
        problem_description: '交通事故，车辆无法移动',
        status: 'processing',
        price: 350,
        driver_id: 1,
        driver_name: '王师傅',
        driver_phone: '13900139001',
        rescue_vehicle_plate: '京 K·001',
        progress: 50
      },
      {
        order_no: 'RW20260326002',
        service_type: 'breakdown',
        channel: 'personal',
        vehicle_plate: '京 Q·22222',
        owner_name: '陈女士',
        owner_phone: '13800138012',
        current_location: '北京市海淀区中关村南大街 5 号',
        destination: '4S 店',
        problem_description: '车辆抛锚，无法启动',
        status: 'processing',
        price: 280,
        driver_id: 1,
        driver_name: '王师傅',
        driver_phone: '13900139001',
        rescue_vehicle_plate: '京 K·001',
        progress: 10
      },
      {
        order_no: 'RW20260326003',
        service_type: 'accident',
        channel: 'insurance',
        vehicle_plate: '京 R·33333',
        owner_name: '赵先生',
        owner_phone: '13800138013',
        current_location: '北京市东城区东直门南大街 1 号',
        destination: '修理厂',
        problem_description: '多方事故',
        status: 'completed',
        price: 450,
        driver_id: 1,
        driver_name: '王师傅',
        driver_phone: '13900139001',
        rescue_vehicle_plate: '京 K·001',
        progress: 100,
        total_fee: 450
      },
      {
        order_no: 'RW20260326004',
        service_type: 'violation',
        channel: 'traffic',
        vehicle_plate: '京 S·44444',
        owner_name: '孙先生',
        owner_phone: '13800138014',
        current_location: '北京市西城区西直门外大街 1 号',
        destination: '停车场',
        problem_description: '违停拖车',
        status: 'pending',
        price: 200,
        driver_id: 2,
        driver_name: '李师傅',
        driver_phone: '13900139002',
        rescue_vehicle_plate: '京 K·002',
        progress: 0
      }
    ];

    for (const order of mockOrders) {
      const exists = await get('SELECT * FROM orders WHERE order_no = ?', [order.order_no]);
      if (!exists) {
        await run(`
          INSERT INTO orders (
            order_no, service_type, channel, vehicle_plate, owner_name, owner_phone,
            current_location, destination, problem_description,
            status, price, driver_id, driver_name, driver_phone,
            rescue_vehicle_plate, progress, total_fee
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          order.order_no, order.service_type, order.channel, order.vehicle_plate,
          order.owner_name, order.owner_phone, order.current_location, order.destination,
          order.problem_description, order.status, order.price, order.driver_id,
          order.driver_name, order.driver_phone, order.rescue_vehicle_plate,
          order.progress, order.total_fee || null
        ]);
      }
    }

    res.json({ success: true, message: '司机模拟数据已初始化' });
  } catch (error) {
    console.error('初始化司机模拟数据错误:', error);
    res.status(500).json({ error: '初始化失败' });
  }
});

module.exports = router;
