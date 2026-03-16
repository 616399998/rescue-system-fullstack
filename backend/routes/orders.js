const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');

// 模拟司机数据
const mockDrivers = [
  { id: 1, name: '王师傅', phone: '139****6666', rating: 4.9, orders: 328, vehicle_plate: '京 B·99999', vehicle_model: '江铃特顺救援车' },
  { id: 2, name: '李师傅', phone: '138****5555', rating: 4.8, orders: 256, vehicle_plate: '京 C·88888', vehicle_model: '福田救援车' },
  { id: 3, name: '张师傅', phone: '137****7777', rating: 4.9, orders: 412, vehicle_plate: '京 D·66666', vehicle_model: '依维柯救援车' }
];

// 创建订单
router.post('/', (req, res) => {
  try {
    const {
      service_type,
      vehicle_type,
      vehicle_plate,
      vehicle_brand,
      vehicle_color,
      current_location,
      destination,
      address,
      problem_description
    } = req.body;

    if (!service_type || !current_location) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 生成订单号
    const orderNo = 'RZ' + new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14) + Math.random().toString(36).slice(2, 4).toUpperCase();

    // 模拟价格
    const prices = {
      'tow': 200,
      'oil': 80,
      'battery': 100,
      'tire': 150,
      'water': 500,
      'medical': 300,
      'other': 100
    };
    const price = prices[service_type] || 100;

    // 随机分配司机
    const driver = mockDrivers[Math.floor(Math.random() * mockDrivers.length)];

    // 插入订单
    const result = db.prepare(`
      INSERT INTO orders (
        order_no, user_id, service_type, vehicle_type, vehicle_plate,
        vehicle_brand, vehicle_color, current_location, destination,
        address, problem_description, status, price,
        driver_id, driver_name, driver_phone, driver_rating,
        rescue_vehicle_plate, rescue_vehicle_model, progress
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      orderNo,
      1, // 默认用户 ID
      service_type,
      vehicle_type || 'sedan',
      vehicle_plate || '京 A·88888',
      vehicle_brand || '大众',
      vehicle_color || '白色',
      current_location,
      destination || current_location,
      address || '',
      problem_description || '',
      price,
      driver.id,
      driver.name,
      driver.phone,
      driver.rating,
      driver.vehicle_plate,
      driver.vehicle_model
    );

    // 添加订单进度
    db.prepare(`
      INSERT INTO order_timeline (order_id, status, description)
      VALUES (?, 'processing', '订单已提交')
    `).run(result.lastInsertRowid);

    res.status(201).json({
      message: '订单创建成功',
      orderId: result.lastInsertRowid,
      orderNo
    });
  } catch (error) {
    console.error('创建订单错误:', error);
    res.status(500).json({ error: '创建订单失败' });
  }
});

// 获取订单列表
router.get('/', (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    let query = 'SELECT * FROM orders WHERE user_id = 1'; // 默认用户 ID
    const params = [];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const orders = db.prepare(query).all(...params);

    // 格式化订单数据
    const formattedOrders = orders.map(order => ({
      id: order.id,
      order_no: order.order_no,
      status: order.status,
      status_text: order.status === 'pending' ? '待处理' : order.status === 'processing' ? '进行中' : '已完成',
      service_type: order.service_type,
      price: order.price,
      created_at: order.created_at,
      vehicle_type: order.vehicle_type,
      vehicle_plate: order.vehicle_plate,
      driver: order.driver_name ? {
        name: order.driver_name,
        phone: order.driver_phone,
        rating: order.driver_rating,
        orders: mockDrivers.find(d => d.id === order.driver_id)?.orders || 0
      } : null,
      rescue_vehicle: order.rescue_vehicle_plate ? {
        plate: order.rescue_vehicle_plate,
        model: order.rescue_vehicle_model,
        status: order.status === 'processing' ? '正在前往' : '已完成',
        progress: order.progress
      } : null
    }));

    res.json({ orders: formattedOrders });
  } catch (error) {
    console.error('获取订单列表错误:', error);
    res.status(500).json({ error: '获取订单失败' });
  }
});

// 获取订单详情
router.get('/:id', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    
    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    // 获取订单进度
    const timeline = db.prepare('SELECT * FROM order_timeline WHERE order_id = ? ORDER BY created_at').all(order.id);

    const formattedOrder = {
      id: order.id,
      order_no: order.order_no,
      status: order.status,
      status_text: order.status === 'pending' ? '待处理' : order.status === 'processing' ? '进行中' : '已完成',
      service_type: order.service_type,
      price: order.price,
      created_at: order.created_at,
      vehicle_type: order.vehicle_type,
      vehicle_plate: order.vehicle_plate,
      current_location: order.current_location,
      destination: order.destination,
      driver: order.driver_name ? {
        name: order.driver_name,
        phone: order.driver_phone,
        rating: order.driver_rating,
        orders: mockDrivers.find(d => d.id === order.driver_id)?.orders || 0
      } : null,
      rescue_vehicle: order.rescue_vehicle_plate ? {
        plate: order.rescue_vehicle_plate,
        model: order.rescue_vehicle_model,
        status: order.status === 'processing' ? '正在前往' : '已完成',
        progress: order.progress
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

module.exports = router;
