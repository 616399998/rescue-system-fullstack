const express = require('express');
const router = express.Router();
const { run, all, get } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 保险端管理员账号
const INSURANCE_USERS = [
  { username: 'insurance001', password: '123456', name: '人保 - 刘经理', company: '中国人民保险' },
  { username: 'insurance002', password: '123456', name: '平安 - 陈专员', company: '中国平安保险' }
];

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/insurance');
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

// ==================== 保险端功能 ====================

// 保险端登录
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = INSURANCE_USERS.find(u => u.username === username && u.password === password);
    
    if (user) {
      res.json({
        success: true,
        token: 'insurance_token_' + username + '_' + Date.now(),
        user: {
          username: user.username,
          name: user.name,
          company: user.company
        }
      });
    } else {
      res.status(401).json({ success: false, error: '账号或密码错误' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 创建拖车申请（保险报案拖车 - 文档第 25 项）
router.post('/tow-request', async (req, res) => {
  try {
    const {
      vehicle_plate,
      owner_name,
      owner_phone,
      is_garage, // 是否地库
      accident_location, // 详细地址
      accident_address, // 坐标
      destination, // 拖车目的地
      insurance_no,
      insurance_company,
      description,
      special_note,
      photos = []
    } = req.body;

    if (!vehicle_plate || !owner_phone || !accident_location) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const orderNo = 'BX' + new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14) + Math.random().toString(36).slice(2, 4).toUpperCase();

    const result = await run(`
      INSERT INTO orders (
        order_no, user_id, service_type, channel,
        vehicle_plate, owner_name, owner_phone,
        is_garage, current_location, destination, address,
        insurance_no, insurance_company,
        problem_description, special_note, photos,
        status, price
      ) VALUES (?, ?, 'accident', 'insurance',
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        'pending', 200)
    `, [
      orderNo, 1,
      vehicle_plate, owner_name, owner_phone,
      is_garage ? 1 : 0, accident_location, destination || '', accident_address || '',
      insurance_no || '', insurance_company || '',
      description || '', special_note || '', JSON.stringify(photos),
    ]);

    await run(
      'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
      [result.lastInsertRowid, 'pending', '保险端提交事故拖车申请，等待调度中心审核']
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
    
    let query = "SELECT * FROM orders WHERE channel = 'insurance'";
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
      is_garage: order.is_garage,
      current_location: order.current_location,
      destination: order.destination,
      insurance_no: order.insurance_no,
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
    const order = await get("SELECT * FROM orders WHERE id = ? AND channel = 'insurance'", [req.params.id]);
    
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
        is_garage: order.is_garage,
        current_location: order.current_location,
        destination: order.destination,
        insurance_no: order.insurance_no,
        insurance_company: order.insurance_company,
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
    const urls = files.map(file => `/uploads/insurance/${file.filename}`);
    res.json({ success: true, urls });
  } catch (error) {
    console.error('上传文件错误:', error);
    res.status(500).json({ error: '上传失败' });
  }
});

// 初始化模拟数据
router.post('/init-mock', async (req, res) => {
  try {
    const mockOrders = [
      {
        order_no: 'BX20260326001',
        service_type: 'accident',
        channel: 'insurance',
        vehicle_plate: '京 F·44444',
        owner_name: '孙八',
        owner_phone: '13800138006',
        insurance_no: 'PICC20260326001',
        insurance_company: '中国人民保险',
        is_garage: 0,
        current_location: '北京市朝阳区北四环东路 8 号',
        address: '39.9845,116.4074',
        destination: '北京朝阳医院',
        problem_description: '追尾事故，车辆前部受损',
        status: 'pending',
        price: 200
      },
      {
        order_no: 'BX20260326002',
        service_type: 'accident',
        channel: 'insurance',
        vehicle_plate: '京 G·55555',
        owner_name: '周九',
        owner_phone: '13800138007',
        insurance_no: 'PA20260326002',
        insurance_company: '中国平安保险',
        is_garage: 1,
        current_location: '北京市海淀区地下车库 B2 层',
        address: '39.9788,116.3125',
        destination: '4S 店',
        problem_description: '地库剐蹭，车辆侧部受损',
        status: 'processing',
        price: 300,
        driver_name: '刘师傅',
        driver_phone: '13900139004',
        rescue_vehicle_plate: '京 K·004'
      },
      {
        order_no: 'BX20260326003',
        service_type: 'accident',
        channel: 'insurance',
        vehicle_plate: '京 H·66666',
        owner_name: '吴十',
        owner_phone: '13800138008',
        insurance_no: 'CPIC20260326003',
        insurance_company: '太平洋保险',
        is_garage: 0,
        current_location: '北京市东城区王府井大街 138 号',
        address: '39.9145,116.4125',
        destination: '修理厂',
        problem_description: '多方事故，车辆无法启动',
        status: 'completed',
        price: 500,
        driver_name: '陈师傅',
        driver_phone: '13900139005',
        rescue_vehicle_plate: '京 K·005',
        total_fee: 500
      }
    ];

    for (const order of mockOrders) {
      const exists = await get('SELECT * FROM orders WHERE order_no = ?', [order.order_no]);
      if (!exists) {
        await run(`
          INSERT INTO orders (
            order_no, service_type, channel, vehicle_plate, owner_name, owner_phone,
            insurance_no, insurance_company, is_garage, current_location, address,
            destination, problem_description, status, price, driver_name, driver_phone,
            rescue_vehicle_plate, total_fee
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          order.order_no, order.service_type, order.channel, order.vehicle_plate,
          order.owner_name, order.owner_phone, order.insurance_no, order.insurance_company,
          order.is_garage, order.current_location, order.address, order.destination,
          order.problem_description, order.status, order.price, order.driver_name,
          order.driver_phone, order.rescue_vehicle_plate, order.total_fee
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
