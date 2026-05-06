# 评价系统升级说明

## 📋 变更概述

将评价系统的权限从**司机评价用户**改为**用户评价司机**，司机端只能查看评价。

## 🔄 主要改动

### 1. 数据库层面 (`config/database.js`)

**order_ratings 表结构升级：**
- ✅ 新增 `user_id` - 评价用户的 ID
- ✅ 新增 `user_rating` - 用户对司机的评分（1-5 星）
- ✅ 新增 `user_comment` - 用户的评价内容
- ✅ 新增 `user_rating_at` - 用户评价时间
- ✅ 保留 `driver_rating` 等字段（向后兼容）

### 2. 后端 API 层面

#### 用户端 API (`routes/orders.js`)
- ✅ `POST /api/orders/:id/rate` - 用户提交对司机的评价
  - 参数：`rating`, `comment`, `driver_id`（可选）
  - 只有已完成的订单可以评价
  - 每个订单只能评价一次
  
- ✅ `GET /api/orders/:id/rating` - 查看订单评价
  - 返回用户评价和司机信息
  - `can_rate` 字段标识是否还可以评价

#### 司机端 API (`routes/drivers.js`)
- ❌ **移除** `POST /drivers/orders/:id/rate` - 司机不能评价用户
- ✅ `GET /drivers/orders/:id/rating` - 查看订单评价
  - 返回用户对司机的评价
  - `can_rate: false` 明确标识司机不能评价
  
- ✅ **新增** `GET /drivers/drivers/:id/ratings` - 获取司机的所有评价
  - 用于展示司机的总体评分和评价列表
  - 包含统计信息：总评价数、平均分

### 3. 前端层面

#### 用户端前端 (`frontend/index.html`)
- ✅ 保留评价弹窗 (`rateModal`) - 用户可以评价司机
- ✅ **新增** 查看评价弹窗 (`viewRateModal`) - 用户可以查看已提交的评价
- ✅ 订单列表逻辑：
  - 已完成未评价 → 显示"⭐ 评价服务"按钮
  - 已完成已评价 → 显示"📋 查看评价"按钮

#### 司机端前端 (`frontend/driver.html`)
- ❌ **移除** 评价订单弹窗 (`rateOrderModal`)
- ✅ 保留查看评价弹窗 (`viewRateModal`) - 司机可以查看用户评价
- ✅ 订单列表逻辑：
  - 已完成订单 → 显示"📋 查看评价"按钮
  - 点击后显示用户对该司机的评价内容
- ✅ 评价展示包含：
  - 用户评分（星级）
  - 评价内容
  - 评价用户（匿名或实名）
  - 评价时间
  - 提示信息："司机端仅可查看评价，不能评价用户"

### 4. 数据联通

- ✅ 用户评价后，司机的平均分会自动更新
- ✅ 所有端都可以实时看到最新的评价数据
- ✅ 司机评分 = 所有用户评价的平均分（四舍五入到 1 位小数）

## 📊 评分计算逻辑

```javascript
// 用户提交评价时自动更新司机评分
const avgResult = await get(
  'SELECT AVG(user_rating) as avg_rating FROM order_ratings WHERE driver_id = ? AND user_rating IS NOT NULL', 
  [driver_id]
);
if (avgResult && avgResult.avg_rating) {
  await run(
    'UPDATE drivers SET rating = ? WHERE id = ?', 
    [Math.round(avgResult.avg_rating * 10) / 10, driver_id]
  );
}
```

## 🚀 部署步骤

1. **备份数据库**（可选但推荐）
   ```bash
   cp backend/config/rescue.db backend/config/rescue.db.backup
   ```

2. **执行数据库迁移**
   ```bash
   cd backend
   node migrate-ratings.js
   ```

3. **重启后端服务**
   ```bash
   # 找到现有进程
   ps aux | grep "node server.js"
   
   # 停止服务
   kill <PID>
   
   # 启动服务
   node server.js
   ```

4. **验证功能**
   - 用户端：创建订单 → 完成订单 → 评价司机 → 查看评价
   - 司机端：登录 → 查看已完成订单 → 点击查看评价 → 确认只能查看

## ✅ 测试清单

- [ ] 用户可以评价已完成的订单
- [ ] 用户不能重复评价同一订单
- [ ] 用户可以查看自己的评价
- [ ] 司机可以查看用户评价
- [ ] 司机不能评价用户（接口和 UI 都已禁用）
- [ ] 司机评分正确计算（平均分）
- [ ] 评价数据在所有端实时同步

## 🔒 安全考虑

- 只有订单状态为 `completed` 才能评价
- 每个订单只能评价一次（通过 `rated` 字段和评价记录检查）
- 司机端评价接口已移除，无法通过 API 提交评价

## 📝 后续优化建议

1. **评价举报机制** - 允许司机举报恶意评价
2. **评价回复功能** - 司机可以回复用户评价（解释或感谢）
3. **评价筛选** - 按评分、时间筛选评价
4. **评价统计** - 司机端展示评分趋势图、评价分布

---

**升级时间**: 2026-04-08  
**升级人员**: 豆豆 🦞  
**影响范围**: 评价系统全链路
