const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { run, all, get } = require('../config/database');

// 模拟司机数据
const mockDrivers = [
  { id: 1, name: '王师傅', phone: '139****6666', rating: 4.9, orders: 328, vehicle_plate: '京 B·99999', vehicle_model: '江铃特顺救援车' },
  { id: 2, name: '李师傅', phone: '138****5555', rating: 4.8, orders: 256, vehicle_plate: '京 C·88888', vehicle_model: '福田救援车' },
  { id: 3, name: '张师傅', phone: '137****7777', rating: 4.9, orders: 412, vehicle_plate: '京 D·66666', vehicle_model: '依维柯救援车' }
];

// 创建订单
router.post('/', async (req, res) => {
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

    const orderNo = 'RZ' + new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14) + Math.random().toString(36).slice(2, 4).toUpperCase();

    // 只保留拖车服务价格
    const prices = { 'tow': 200 };
    const price = prices[service_type] || 200;

    const driver = mockDrivers[Math.floor(Math.random() * mockDrivers.length)];

    const result = await run(`
      INSERT INTO orders (
        order_no, user_id, service_type, vehicle_type, vehicle_plate,
        vehicle_brand, vehicle_color, current_location, destination,
        address, problem_description, status, price,
        driver_id, driver_name, driver_phone, driver_rating,
        rescue_vehicle_plate, rescue_vehicle_model, progress
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?, 0)
    `, [
      orderNo, 1, service_type,
      vehicle_type || 'sedan', vehicle_plate || '京 A·88888',
      vehicle_brand || '大众', vehicle_color || '白色',
      current_location, destination || '',
      address || '', problem_description || '',
      price, driver.id, driver.name, driver.phone, driver.rating,
      driver.vehicle_plate, driver.vehicle_model
    ]);

    await run(`INSERT INTO order_timeline (order_id, status, description) VALUES (?, 'processing', '订单已提交，拖车师傅正在前往')`, [result.lastInsertRowid]);

    res.status(201).json({ 
      message: '订单创建成功', 
      orderId: result.lastInsertRowid, 
      orderNo,
      price,
      driver: {
        name: driver.name,
        phone: driver.phone,
        eta: '30 分钟'
      }
    });
  } catch (error) {
    console.error('创建订单错误:', error);
    res.status(500).json({ error: '创建订单失败' });
  }
});

// 获取订单列表
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    let query = 'SELECT * FROM orders WHERE user_id = 1';
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
      status_text: order.status === 'pending' ? '待处理' : order.status === 'processing' ? '进行中' : '已完成',
      service_type: order.service_type,
      service_name: '拖车救援',
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
      } : null
    }));

    res.json({ orders: formattedOrders });
  } catch (error) {
    console.error('获取订单列表错误:', error);
    res.status(500).json({ error: '获取订单失败' });
  }
});

// 获取订单详情
router.get('/:id', async (req, res) => {
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
      status_text: order.status === 'pending' ? '待处理' : order.status === 'processing' ? '进行中' : '已完成',
      service_type: order.service_type,
      service_name: '拖车救援',
      price: order.price,
      created_at: order.created_at,
      vehicle_type: order.vehicle_type,
      vehicle_plate: order.vehicle_plate,
      current_location: order.current_location,
      destination: order.destination,
      problem_description: order.problem_description,
      driver: order.driver_name ? {
        name: order.driver_name,
        phone: order.driver_phone,
        rating: order.driver_rating,
        orders: mockDrivers.find(d => d.id === order.driver_id)?.orders || 0,
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

module.exports = router;
