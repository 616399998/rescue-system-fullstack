# 智能救援系统 - 全栈版本

🚗 基于 Node.js + Express + SQLite 的智能救援平台

## 🌟 功能特性

### 前端
- ✅ 赛博朋克风格 UI 界面
- ✅ 4 种快捷救援入口（道路/医疗/水上/紧急呼叫）
- ✅ 热门服务卡片展示
- ✅ 订单管理（筛选/详情）
- ✅ 个人中心（余额/充值/统计）
- ✅ 响应式设计，适配移动端

### 后端 API
- ✅ 用户认证（JWT）
- ✅ 订单管理（创建/查询/进度）
- ✅ 充值系统（金额配置/赠送优惠）
- ✅ 用户信息管理
- ✅ SQLite 数据库持久化

## 📦 技术栈

**后端**
- Node.js 18+
- Express 4.x
- better-sqlite3
- bcryptjs（密码加密）
- jsonwebtoken（JWT 认证）

**前端**
- 原生 HTML/CSS/JavaScript
- Leaflet 地图（可选）
- Fetch API

## 🚀 快速开始

### 1. 安装依赖
```bash
cd backend
npm install
```

### 2. 启动服务
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

服务启动后访问：http://localhost:3000

## 📁 项目结构

```
rescue-system-fullstack/
├── backend/
│   ├── config/
│   │   └── database.js      # 数据库配置
│   ├── routes/
│   │   ├── auth.js          # 认证路由
│   │   ├── users.js         # 用户路由
│   │   ├── orders.js        # 订单路由
│   │   └── recharge.js      # 充值路由
│   ├── server.js            # 主服务器
│   └── package.json
└── frontend/
    └── index.html           # 前端页面
```

## 🔌 API 接口

### 认证
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户

### 订单
- `POST /api/orders` - 创建订单
- `GET /api/orders` - 获取订单列表
- `GET /api/orders/:id` - 获取订单详情

### 充值
- `POST /api/recharge` - 创建充值
- `GET /api/recharge/records` - 获取充值记录

### 用户
- `GET /api/users/profile` - 获取用户信息
- `GET /api/users/vehicles` - 获取车辆列表

## 🌐 部署

### Docker 部署（推荐）
```bash
docker build -t rescue-system .
docker run -p 3000:3000 rescue-system
```

### 服务器部署
1. 上传代码到服务器
2. 安装 Node.js 18+
3. `cd backend && npm install`
4. `npm start`
5. 使用 PM2 管理：`pm2 start server.js --name rescue`

## 📱 访问地址

- **本地开发**: http://localhost:3000
- **生产环境**: 部署后访问服务器 IP:3000

## 📝 默认数据

系统初始化后会自动创建：
- 默认用户：自动登录（ID=1）
- 默认余额：¥1,286.00
- 默认积分：3,200
- 默认车辆：京 A·88888

## 🔐 安全建议

生产环境请修改：
1. JWT_SECRET 环境变量
2. 启用 HTTPS
3. 配置 CORS 白名单
4. 添加 rate limiting

## 📄 License

MIT
