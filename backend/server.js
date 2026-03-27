const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./config/database');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const orderRoutes = require('./routes/orders');
const rechargeRoutes = require('./routes/recharge');
const adminRoutes = require('./routes/admin');
const driverRoutes = require('./routes/drivers');
const trafficRoutes = require('./routes/traffic');
const enforcementRoutes = require('./routes/enforcement');
const insuranceRoutes = require('./routes/insurance');

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化数据库（异步）
initDatabase().then(() => {
  console.log('✅ 数据库初始化完成');
}).catch(err => {
  console.error('❌ 数据库初始化失败:', err);
});

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务（前端）
app.use(express.static(path.join(__dirname, '../frontend')));

// 静态文件服务（上传文件）
app.use('/uploads', express.static(path.join(__dirname, '../backend/uploads')));

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/recharge', rechargeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/traffic', trafficRoutes);
app.use('/api/enforcement', enforcementRoutes);
app.use('/api/insurance', insuranceRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 前端路由 - 所有其他请求返回前端页面
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 救援系统后端服务已启动`);
  console.log(`📍 本地访问：http://localhost:${PORT}`);
  console.log(`🌐 网络访问：http://0.0.0.0:${PORT}`);
});
