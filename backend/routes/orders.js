const express = require('express');
const router = express.Router();
const { run, all, get } = require('../config/database');
const { authMiddleware } = require('./auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/orders');
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

// 腾讯地图 Key
const TENCENT_MAP_KEY = '67MBZ-EF6RT-THAX4-VEGBL-7AYMJ-LGBXX';

// 地理编码辅助函数
async function geocodeAddress(address) {
  try {
    const url = `https://apis.map.qq.com/ws/geocoder/v1/?address=${encodeURIComponent(address)}&key=${TENCENT_MAP_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 0 && data.result && data.result.location) {
      return { lat: data.result.location.lat, lng: data.result.location.lng };
    }
  } catch (error) {
    console.error('地理编码失败:', error);
  }
  return { lat: 39.9042, lng: 116.4074 };
}

// 创建订单（需登录）
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      service_type, vehicle_type, vehicle_plate, vehicle_brand, vehicle_color,
      current_location, current_coord, destination, destination_coord, address,
      problem_description, owner_name, owner_phone, movable, special_note, photos = []
    } = req.body;

    if (!service_type || !current_location || !owner_phone) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const orderNo = 'RZ' + new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14) + Math.random().toString(36).slice(2, 4).toUpperCase();

    const prices = { 'tow': 200, 'accident': 200, 'violation': 200, 'breakdown': 200 };
    const price = prices[service_type] || 200;

    // 自动地理编码
    let finalCurrentCoord = current_coord || '';
    let finalDestCoord = destination_coord || '';
    
    if (!finalCurrentCoord && current_location) {
      const coord = await geocodeAddress(current_location);
      finalCurrentCoord = `${coord.lat},${coord.lng}`;
    }
    if (!finalDestCoord && destination) {
      const coord = await geocodeAddress(destination);
      finalDestCoord = `${coord.lat},${coord.lng}`;
    }

    const result = await run(`
      INSERT INTO orders (
        order_no, user_id, service_type, vehicle_type, vehicle_plate,
        vehicle_brand, vehicle_color, current_location, destination,
        address, current_coord, destination_coord, problem_description, status, price,
        owner_name, owner_phone, movable, special_note, photos, channel,
        driver_id, driver_name, driver_phone, driver_rating,
        rescue_vehicle_plate, rescue_vehicle_model, progress
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, 'personal',
        ?, ?, ?, ?, ?, ?, 0)
    `, [
      orderNo, userId, service_type,
      vehicle_type || 'sedan', vehicle_plate || '',
      vehicle_brand || '', vehicle_color || '',
      current_location, destination || '',
      address || '', finalCurrentCoord, finalDestCoord,
      problem_description || '',
      price, owner_name || '', owner_phone, movable || 'yes', special_note || '',
      JSON.stringify(photos),
      null, null, null, null, null, null
    ]);

    await run(
      'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
      [result.lastInsertRowid, 'pending', '订单已提交，等待调度中心审核']
    );

    res.status(201).json({ 
      success: true,
      message: '订单创建成功', 
      orderId: result.lastInsertRowid, 
      orderNo 
    });
  } catch (error) {
    console.error('创建订单错误:', error);
    res.status(500).json({ error: '创建订单失败' });
  }
});

// 获取订单列表（需登录）
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status, page = 1, limit = 10 } = req.query;
    
    let query = 'SELECT * FROM orders WHERE user_id = ?';
    const params = [userId];

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
        price: order.price,
        created_at: order.created_at,
        vehicle_type: order.vehicle_type,
        vehicle_plate: order.vehicle_plate,
        current_location: order.current_location,
        destination: order.destination,
        owner_name: order.owner_name,
        owner_phone: order.owner_phone,
        rated: order.rated || false,
        driver: order.driver_name ? {
          name: order.driver_name,
          phone: order.driver_phone,
          rating: order.driver_rating,
          orders: order.driver_total_orders || 0,
          vehicle_plate: order.rescue_vehicle_plate,
          vehicle_model: order.rescue_vehicle_model
        } : null
      };
    });

    res.json({ success: true, orders: formattedOrders });
  } catch (error) {
    console.error('获取订单列表错误:', error);
    res.status(500).json({ error: '获取订单失败' });
  }
});

// 获取订单详情
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const order = await get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.user.userId]);

    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    const timeline = await all('SELECT * FROM order_timeline WHERE order_id = ? ORDER BY created_at', [order.id]);

    let statusText = '待处理';
    if (order.status === 'processing') statusText = '进行中';
    else if (order.status === 'completed') statusText = '已完成';
    else if (order.status === 'cancelled') statusText = '已取消';

    const formattedOrder = {
      id: order.id,
      order_no: order.order_no,
      status: order.status,
      status_text: statusText,
      service_type: order.service_type,
      price: order.price,
      created_at: order.created_at,
      vehicle_type: order.vehicle_type,
      vehicle_plate: order.vehicle_plate,
      current_location: order.current_location,
      address: order.address,
      destination: order.destination,
      destination_coord: order.destination_coord,
      problem_description: order.problem_description,
      owner_name: order.owner_name,
      owner_phone: order.owner_phone,
      movable: order.movable,
      special_note: order.special_note,
      photos: order.photos ? JSON.parse(order.photos) : [],
      rated: order.rated || false,
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

    res.json({ success: true, order: formattedOrder });
  } catch (error) {
    console.error('获取订单详情错误:', error);
    res.status(500).json({ error: '获取订单失败' });
  }
});

// 取消订单
router.put('/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const orderId = req.params.id;
    const { reason } = req.body;

    const order = await get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, req.user.userId]);
    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ error: '订单已开始处理，无法取消' });
    }

    await run('UPDATE orders SET status = ? WHERE id = ?', ['cancelled', orderId]);
    await run(
      'INSERT INTO order_timeline (order_id, status, description) VALUES (?, ?, ?)',
      [orderId, 'cancelled', `用户取消订单${reason ? '：' + reason : ''}`]
    );

    res.json({ success: true, message: '订单已取消' });
  } catch (error) {
    console.error('取消订单错误:', error);
    res.status(500).json({ error: '取消订单失败' });
  }
});

// 提交评价
router.post('/:id/rate', authMiddleware, async (req, res) => {
  try {
    const orderId = req.params.id;
    const { rating, comment, driver_id } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: '评分无效' });
    }

    const order = await get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, req.user.userId]);
    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    if (order.status !== 'completed') {
      return res.status(400).json({ error: '订单未完成，无法评价' });
    }

    const existing = await get('SELECT * FROM order_ratings WHERE order_id = ?', [orderId]);
    if (existing && existing.user_rating) {
      return res.status(400).json({ error: '已评价过该订单' });
    }

    const userId = req.user.userId;

    if (existing) {
      await run(`
        UPDATE order_ratings SET 
          user_rating = ?, user_comment = ?, user_rating_at = ?, updated_at = ?
        WHERE order_id = ?
      `, [rating, comment || '', new Date().toISOString(), new Date().toISOString(), orderId]);
    } else {
      await run(`
        INSERT INTO order_ratings (order_id, user_id, driver_id, user_rating, user_comment, user_rating_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [orderId, userId, driver_id || order.driver_id, rating, comment || '', new Date().toISOString()]);
    }

    await run('UPDATE orders SET rated = 1, rated_at = ? WHERE id = ?', [new Date().toISOString(), orderId]);

    if (driver_id || order.driver_id) {
      const did = driver_id || order.driver_id;
      const avgResult = await get('SELECT AVG(user_rating) as avg_rating FROM order_ratings WHERE driver_id = ? AND user_rating IS NOT NULL', [did]);
      if (avgResult && avgResult.avg_rating) {
        await run('UPDATE drivers SET rating = ? WHERE id = ?', [Math.round(avgResult.avg_rating * 10) / 10, did]);
      }
    }

    res.json({ success: true, message: '评价成功' });
  } catch (error) {
    console.error('提交评价错误:', error);
    res.status(500).json({ error: '提交评价失败' });
  }
});

// 获取订单评价
router.get('/:id/rating', authMiddleware, async (req, res) => {
  try {
    const orderId = req.params.id;
    const rating = await get('SELECT * FROM order_ratings WHERE order_id = ?', [orderId]);
    
    if (!rating) {
      return res.json({ rating: null, can_rate: true });
    }

    const order = await get('SELECT order_no, driver_id FROM orders WHERE id = ? AND user_id = ?', [orderId, req.user.userId]);

    res.json({
      rating: {
        ...rating,
        order_no: order?.order_no || '',
        can_rate: !rating.user_rating
      }
    });
  } catch (error) {
    console.error('获取评价错误:', error);
    res.status(500).json({ error: '获取评价失败' });
  }
});

// 上传照片（无需登录，创建订单前上传）
router.post('/upload', upload.array('photos', 9), (req, res) => {
  try {
    const files = req.files || [];
    const urls = files.map(file => `/uploads/orders/${file.filename}`);
    res.json({ success: true, urls });
  } catch (error) {
    console.error('上传照片错误:', error);
    res.status(500).json({ error: '上传失败' });
  }
});

// 坐标转换 + 逆地理编码
router.post('/geocode', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) {
      return res.status(400).json({ error: '缺少经纬度参数' });
    }

    const axios = require('axios');
    const key = TENCENT_MAP_KEY;
    const headers = { 'Referer': 'https://akesurescue.com', 'User-Agent': 'Mozilla/5.0' };
    
    const coordUrl = `https://apis.map.qq.com/ws/coord/v1/translate?locations=${lat},${lng}&type=1&key=${key}`;
    const coordResponse = await axios.get(coordUrl, { headers });
    const coordData = coordResponse.data;
    
    let finalLat = lat;
    let finalLng = lng;
    
    if (coordData.status === 0 && coordData.locations && coordData.locations.length > 0) {
      finalLat = coordData.locations[0].lat;
      finalLng = coordData.locations[0].lng;
    }
    
    const geocodeUrl = `https://apis.map.qq.com/ws/geocoder/v1/?location=${finalLat},${finalLng}&key=${key}`;
    const geocodeResponse = await axios.get(geocodeUrl, { headers });
    const geocodeData = geocodeResponse.data;
    
    if (geocodeData.status === 0 && geocodeData.result) {
      const address = geocodeData.result.address || geocodeData.result.formatted_addresses?.recommend || '';
      res.json({ success: true, address, fullResult: geocodeData.result, coordConverted: coordData.status === 0 });
    } else {
      res.json({ success: false, error: geocodeData.message || '逆地理编码失败' });
    }
  } catch (error) {
    console.error('地理编码错误:', error.message);
    res.status(500).json({ error: '地理编码失败' });
  }
});

module.exports = router;
