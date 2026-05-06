# 智能救援系统 - 全栈版本

🚗 基于 Node.js + Express + SQLite 的智能救援平台

**项目地址**: https://github.com/616399998/rescue-system-fullstack

## 🌟 功能特性

### 三端系统

#### 1️⃣ 用户端 (`/index.html`)
- ✅ 赛博朋克风格 UI 界面
- ✅ 4 种快捷救援入口（道路/医疗/水上/紧急呼叫）
- ✅ 热门服务卡片展示
- ✅ 订单管理（创建/筛选/详情/取消）
- ✅ 个人中心（余额/充值/统计）
- ✅ **⭐ 评价系统** - 用户可评价司机
- ✅ 响应式设计，适配移动端

#### 2️⃣ 司机端 (`/driver.html`)
- ✅ 司机登录/注册
- ✅ 任务列表（待抢单/已接单）
- ✅ 任务确认/拒绝
- ✅ 任务进度更新（出发/到达现场/开始作业/完成）
- ✅ 位置实时上报
- ✅ 接单状态切换（开启/关闭）
- ✅ **⭐ 评价查看** - 查看用户评价（不能评价用户）
- ✅ 订单列表滚动加载（分页展示）
- ✅ 个人中心（统计/收入）

#### 3️⃣ 后台管理端 (`/admin.html`)
- ✅ 管理员登录
- ✅ 仪表盘（订单统计/收入统计）
- ✅ 智能派单（手动派单）
- ✅ 订单管理（查看/调度/完成/取消）
- ✅ 司机管理（审核/下线/编辑）
- ✅ 用户管理
- ✅ 财务报表（收入统计/日/月报）
- ✅ **⭐ 评价管理** - 查看/筛选/删除评价

### 后端 API
- ✅ 用户认证（JWT）
- ✅ 订单管理（创建/查询/进度/评价）
- ✅ 司机管理（注册/登录/任务/状态）
- ✅ 充值系统（金额配置/赠送优惠）
- ✅ 评价系统（用户评价司机/数据联通）
- ✅ 后台管理（统计/派单/审核）
- ✅ SQLite 数据库持久化

## 📦 技术栈

**后端**
- Node.js 18+
- Express 4.x
- SQLite3
- bcryptjs（密码加密）
- jsonwebtoken（JWT 认证）
- multer（文件上传）

**前端**
- 原生 HTML/CSS/JavaScript
- 腾讯地图 API
- Fetch API
- 赛博朋克风格 UI

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
│   │   ├── drivers.js       # 司机路由
│   │   ├── admin.js         # 管理路由
│   │   ├── recharge.js      # 充值路由
│   │   └── ...
│   ├── server.js            # 主服务器
│   └── package.json
├── frontend/
│   ├── index.html           # 用户端
│   ├── driver.html          # 司机端
│   └── admin.html           # 管理端
└── README.md
```

## 🔌 API 接口

### 用户端
- `POST /api/orders` - 创建订单
- `GET /api/orders` - 获取订单列表
- `POST /api/orders/:id/rate` - 评价司机
- `GET /api/orders/:id/rating` - 查看评价

### 司机端
- `POST /api/drivers/login` - 司机登录
- `GET /api/drivers/tasks` - 获取任务列表
- `PUT /api/drivers/tasks/:id/confirm` - 确认/拒绝任务
- `GET /api/drivers/orders/:id/rating` - 查看评价

### 管理端
- `POST /api/admin/login` - 管理员登录
- `GET /api/admin/stats` - 统计数据
- `GET /api/admin/ratings` - 评价管理
- `DELETE /api/admin/ratings/:id` - 删除评价

## 🌐 部署

### 服务器部署
1. 上传代码到服务器
2. 安装 Node.js 18+
3. `cd backend && npm install`
4. `npm start`
5. 使用 PM2 管理：`pm2 start server.js --name rescue`

## 📱 访问地址

**生产环境（域名）**:
- **用户端**: https://akesurescue.com/index.html
- **司机端**: https://akesurescue.com/driver.html
- **管理端**: https://akesurescue.com/admin.html

**本地开发**:
- **用户端**: http://localhost:3000/index.html
- **司机端**: http://localhost:3000/driver.html
- **管理端**: http://localhost:3000/admin.html

**默认管理员账号**:
- 账号：`admin`
- 密码：`admin123`

## 📊 项目进度

### 已完成功能（2026-04-08）

#### 评价系统全链路 ✅
- ✅ 用户端：评价司机、查看评价
- ✅ 司机端：查看评价（不能评价）
- ✅ 管理端：评价管理（查看/筛选/删除）
- ✅ 数据联通：评分自动计算

#### 司机端优化 ✅
- ✅ 订单列表滚动加载（分页）
- ✅ 接单状态持久化（刷新不丢失）
- ✅ 移动端优化（隐藏滚动条）

#### 后台管理 ✅
- ✅ 评价管理模块
- ✅ 评价筛选（按司机/按评分）
- ✅ 评价详情查看
- ✅ 删除恶意评价

### 详细文档
- `RATINGS_UPGRADE.md` - 评价系统升级说明
- `DRIVER_ORDERS_SCROLL.md` - 司机端滚动优化
- `ACCEPTING_STATUS_FIX.md` - 接单状态持久化
- `ADMIN_RATINGS_MODULE.md` - 后台评价管理

## 📝 默认数据

系统初始化后会自动创建：
- 默认用户：自动登录（ID=1）
- 默认司机：王师傅/李师傅/张师傅
- 默认余额：¥1,286.00
- 默认积分：3,200

## 🔐 安全建议

生产环境请修改：
1. 管理员密码
2. 启用 HTTPS
3. 配置 CORS 白名单
4. 添加 rate limiting

## 📄 License

MIT

---

**最后更新**: 2026-04-08  
**开发团队**: 豆豆 🦞
