const express = require('express');
const router = express.Router();
const { run, all, get } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 交管端管理员账号
const TRAFFIC_USERS = [
  { username: 'traffic001', password: '123456', name: '交管局 - 张警官', department: '交通管理局' },
  { username: 'traffic002', password: '123456', name: '交管局 - 李警官', department: '交通管理局' }
];

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/traffic');
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
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.startsWith('video/');
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片和视频文件'));
    }
  }
});

// ==================== 交管端功能 ====================

// 交管端登录
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = TRAFFIC_USERS.find(u => u.username === username && u.password === password);
    
    if (user) {
      res.json({
        success: true,
        token: 'traffic_token_' + username + '_' + Date.now(),
        user: {
          username: user.username,
          name: user.name,
          department: user.department
        }
      });
    } else {
      res.status(401).json({ success: false, error: '账号或密码错误' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 创建拖车申请（违法拖车 - 文档第 24 项）
router.post('/tow-request', async (req, res) => {
  try {
    const {
      vehicle_plate,
      owner_name,
      owner_phone,
      violation_type, // 违停、占用应急车道等
      found_time,
      found_location, // 地址
      found_address, // 坐标
      description,
      special_note,
      photos = []
    } = req.body;

    if (!vehicle_plate || !owner_phone || !found_location) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const orderNo = 'JT' + new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14) + Math.random().toString(36).slice(2, 4).toUpperCase();

    const result = await run(`
      INSERT INTO orders (
        order_no, user_id, service_type, channel,
        vehicle_plate, owner_name, owner_phone,
        violation_type, found_time, found_location, found_address,
        problem_description, special_note, photos,
        current_location, status, price
      ) VALUES (?, ?, 'violation', 'traffic',
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, 'pending', 200)
    `, [
      orderNo, 1,
      vehicle_plate, owner_name, owner_phone,
      violation_type || '', found_time || new Date().toISOString(), found_location, found_address || '',
      description || '', special_note || '', JSON.stringify(photos),
      found_location
    ]);

    await run(
      'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
      [result.lastInsertRowid, 'pending', '交管端提交违法拖车申请，等待调度中心审核']
    );

    res.status(201).json({ 
      message: '拖车申请已提交', 
      orderId: result.lastInsertRowid, 
      orderNo 
    });
  } catch (error) {
    console.error('创建拖车申请错误:', error);
    res.status(500).json({ error: '创建申请失败' });
  }
});

// 获取订单列表
router.get('/orders', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    let query = "SELECT * FROM orders WHERE channel = 'traffic'";
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
      status_text: order.status === 'pending' ? '待审核' : order.status === 'processing' ? '处理中' : order.status === 'completed' ? '已完成' : '已取消',
      vehicle_plate: order.vehicle_plate,
      violation_type: order.violation_type,
      found_location: order.found_location,
      owner_phone: order.owner_phone,
      driver_name: order.driver_name,
      driver_phone: order.driver_phone,
      created_at: order.created_at
    }));

    res.json({ orders: formattedOrders });
  } catch (error) {
    console.error('获取订单列表错误:', error);
    res.status(500).json({ error: '获取订单失败' });
  }
});

// 获取订单详情
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await get("SELECT * FROM orders WHERE id = ? AND channel = 'traffic'", [req.params.id]);
    
    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    const timeline = await all('SELECT * FROM order_timeline WHERE order_id = ? ORDER BY created_at', [order.id]);

    res.json({
      order: {
        id: order.id,
        order_no: order.order_no,
        status: order.status,
        vehicle_plate: order.vehicle_plate,
        owner_name: order.owner_name,
        owner_phone: order.owner_phone,
        violation_type: order.violation_type,
        found_time: order.found_time,
        found_location: order.found_location,
        found_address: order.found_address,
        description: order.problem_description,
        special_note: order.special_note,
        photos: order.photos ? JSON.parse(order.photos) : [],
        driver: order.driver_name ? {
          name: order.driver_name,
          phone: order.driver_phone,
          vehicle_plate: order.rescue_vehicle_plate
        } : null,
        timeline: timeline.map(t => ({
          time: new Date(t.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          content: t.description
        }))
      }
    });
  } catch (error) {
    console.error('获取订单详情错误:', error);
    res.status(500).json({ error: '获取订单失败' });
  }
});

// 上传照片/视频
router.post('/upload', upload.array('files', 9), (req, res) => {
  try {
    const files = req.files || [];
    const urls = files.map(file => `/uploads/traffic/${file.filename}`);
    res.json({ success: true, urls });
  } catch (error) {
    console.error('上传文件错误:', error);
    res.status(500).json({ error: '上传失败' });
  }
});

// 坐标转换 + 逆地理编码（调用腾讯地图 Web Service API）
router.post('/geocode', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: '缺少经纬度参数' });
    }

    const axios = require('axios');
    const key = '67MBZ-EF6RT-THAX4-VEGBL-7AYMJ-LGBXX';
    
    // 第一步：坐标转换（GPS 坐标转腾讯坐标）
    const coordUrl = `https://apis.map.qq.com/ws/coord/v1/translate?locations=${lat},${lng}&type=1&key=${key}`;
    const coordResponse = await axios.get(coordUrl);
    const coordData = coordResponse.data;
    
    console.log('坐标转换结果:', coordData);
    
    let finalLat = lat;
    let finalLng = lng;
    
    if (coordData.status === 0 && coordData.locations && coordData.locations.length > 0) {
      finalLat = coordData.locations[0].lat;
      finalLng = coordData.locations[0].lng;
      console.log('转换后坐标:', finalLat, finalLng);
    }
    
    // 第二步：逆地理编码
    const geocodeUrl = `https://apis.map.qq.com/ws/geocoder/v1/?location=${finalLat},${finalLng}&key=${key}`;
    const geocodeResponse = await axios.get(geocodeUrl);
    const geocodeData = geocodeResponse.data;
    
    console.log('逆地理编码结果:', geocodeData);
    
    if (geocodeData.status === 0 && geocodeData.result) {
      const address = geocodeData.result.address || geocodeData.result.formatted_addresses?.recommend || '';
      res.json({ 
        success: true, 
        address,
        fullResult: geocodeData.result,
        coordConverted: coordData.status === 0
      });
    } else {
      res.json({ success: false, error: geocodeData.message || '逆地理编码失败' });
    }
  } catch (error) {
    console.error('地理编码错误:', error.message);
    res.status(500).json({ error: '地理编码失败' });
  }
});

// 初始化模拟数据
router.post('/init-mock', async (req, res) => {
  try {
    const mockOrders = [
      {
        order_no: 'JT20260326001',
        service_type: 'violation',
        channel: 'traffic',
        vehicle_plate: '京 A·12345',
        owner_name: '张三',
        owner_phone: '13800138001',
        violation_type: '违停',
        found_time: new Date().toISOString(),
        found_location: '北京市朝阳区建国路 88 号 SOHO 现代城',
        found_address: '39.9042,116.4074',
        problem_description: '车辆违规停放在主干道，影响交通',
        status: 'pending',
        price: 200
      },
      {
        order_no: 'JT20260326002',
        service_type: 'violation',
        channel: 'traffic',
        vehicle_plate: '京 B·67890',
        owner_name: '李四',
        owner_phone: '13800138002',
        violation_type: '占用应急车道',
        found_time: new Date(Date.now() - 3600000).toISOString(),
        found_location: '北京市东城区东长安街 1 号',
        found_address: '39.9087,116.3975',
        problem_description: '早高峰期间占用应急车道',
        status: 'processing',
        price: 200,
        driver_name: '王师傅',
        driver_phone: '13900139001',
        rescue_vehicle_plate: '京 K·001'
      },
      {
        order_no: 'JT20260326003',
        service_type: 'violation',
        channel: 'traffic',
        vehicle_plate: '京 C·11111',
        owner_name: '王五',
        owner_phone: '13800138003',
        violation_type: '事故车辆',
        found_time: new Date(Date.now() - 7200000).toISOString(),
        found_location: '北京市海淀区中关村大街 1 号',
        found_address: '39.9788,116.3125',
        problem_description: '交通事故，车辆无法移动',
        status: 'completed',
        price: 350,
        driver_name: '李师傅',
        driver_phone: '13900139002',
        rescue_vehicle_plate: '京 K·002',
        total_fee: 350
      }
    ];

    for (const order of mockOrders) {
      const exists = await get('SELECT * FROM orders WHERE order_no = ?', [order.order_no]);
      if (!exists) {
        await run(`
          INSERT INTO orders (
            order_no, service_type, channel, vehicle_plate, owner_name, owner_phone,
            violation_type, found_time, found_location, found_address,
            problem_description, status, price, driver_name, driver_phone,
            rescue_vehicle_plate, total_fee, current_location
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          order.order_no, order.service_type, order.channel, order.vehicle_plate,
          order.owner_name, order.owner_phone, order.violation_type, order.found_time,
          order.found_location, order.found_address, order.problem_description,
          order.status, order.price, order.driver_name, order.driver_phone,
          order.rescue_vehicle_plate, order.total_fee || null, order.found_location
        ]);
      }
    }

    res.json({ success: true, message: '模拟数据已初始化' });
  } catch (error) {
    console.error('初始化模拟数据错误:', error);
    res.status(500).json({ error: '初始化失败' });
  }
});

module.exports = router;
