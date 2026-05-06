# 司机端接单状态持久化修复

## 🐛 问题描述

**现象**：司机关闭接单状态后，刷新页面或重新登录又自动开启接单。

**原因**：后端服务每次启动时，都会执行以下 SQL 语句重置所有 `NULL` 值为 `1`（开启）：

```sql
UPDATE drivers SET accepting_orders = 1 WHERE accepting_orders IS NULL
```

这导致司机手动关闭的接单状态被强制重置。

## ✅ 修复方案

### 1. 后端服务启动逻辑 (`backend/server.js`)

**修改前**：
```javascript
// 更新现有司机的接单状态为开启
db.run(`UPDATE drivers SET accepting_orders = 1, accepting_orders_updated_at = CURRENT_TIMESTAMP WHERE accepting_orders IS NULL`, (err) => {
  if (err) {
    console.error('更新接单状态失败:', err);
  } else {
    console.log('✅ 已更新现有司机的接单状态');
  }
});
```

**修改后**：
```javascript
// 注意：不再自动重置司机的接单状态，保留用户的选择
// 只有当字段为 NULL 时才设置为默认值 1（仅针对新字段初始化）
db.run(`UPDATE drivers SET accepting_orders = 1, accepting_orders_updated_at = CURRENT_TIMESTAMP WHERE accepting_orders IS NULL AND id IN (SELECT id FROM drivers WHERE accepting_orders IS NULL LIMIT 0)`, (err) => {
  // 这是一个空更新，仅用于保持代码结构，不实际执行任何更新
  if (err) {
    console.error('初始化接单状态失败:', err);
  }
});
```

### 2. 返回司机信息逻辑 (`backend/routes/drivers.js`)

**修改前**：
```javascript
accepting_orders: driver.accepting_orders || 1, // 默认开启接单
```

**修改后**：
```javascript
accepting_orders: driver.accepting_orders !== null ? driver.accepting_orders : 1, // 如果为 NULL 则默认开启，否则使用保存的值
```

## 📊 修复效果

### 修复前
```
1. 司机登录 → 接单状态：✅ 开启
2. 司机关闭接单 → 接单状态：❌ 已关闭
3. 刷新页面 → 接单状态：✅ 开启 ❌（被强制重置）
```

### 修复后
```
1. 司机登录 → 接单状态：✅ 开启（首次默认）
2. 司机关闭接单 → 接单状态：❌ 已关闭
3. 刷新页面 → 接单状态：❌ 已关闭 ✅（保留用户选择）
4. 司机开启接单 → 接单状态：✅ 开启
5. 刷新页面 → 接单状态：✅ 开启 ✅（保留用户选择）
```

## 🔧 技术细节

### 数据库字段
```sql
ALTER TABLE drivers ADD COLUMN accepting_orders INTEGER DEFAULT 1;
ALTER TABLE drivers ADD COLUMN accepting_orders_updated_at DATETIME;
```

### API 端点
- **GET** `/api/drivers/profile/:id` - 获取司机信息（包含接单状态）
- **PUT** `/api/drivers/profile/:id/toggle-accepting` - 切换接单状态

### 前端逻辑
```javascript
// 加载接单状态
async function loadAcceptingStatus() {
    const res = await fetch(`${API_BASE}/drivers/profile/${currentDriver.id}`);
    const data = await res.json();
    
    const isAccepting = data.driver.accepting_orders === 1;
    document.getElementById('acceptingToggle').checked = isAccepting;
    // ...
}

// 切换接单状态
async function toggleAcceptingOrders() {
    const isAccepting = document.getElementById('acceptingToggle').checked;
    
    const res = await fetch(`${API_BASE}/drivers/profile/${currentDriver.id}/toggle-accepting`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepting_orders: isAccepting })
    });
    // ...
}
```

## ✅ 测试清单

- [ ] 司机登录，默认接单状态为开启
- [ ] 手动关闭接单，显示"❌ 已暂停接单"
- [ ] 刷新页面，接单状态仍为关闭 ✅
- [ ] 手动开启接单，显示"✅ 接单中"
- [ ] 刷新页面，接单状态仍为开启 ✅
- [ ] 后端重启后，司机状态依然保留 ✅

## 🚀 部署步骤

1. **重启后端服务**
   ```bash
   # 找到现有进程
   ps aux | grep "node server.js"
   
   # 停止服务
   kill <PID>
   
   # 启动服务
   cd backend
   node server.js
   ```

2. **无需数据库迁移** - 字段已存在
3. **无需前端更新** - 前端逻辑已正确

## 📝 注意事项

1. **历史数据** - 已存在的司机账号，如果 `accepting_orders` 为 `NULL`，首次查询时会返回默认值 `1`（开启）
2. **新注册司机** - 默认接单状态为开启（数据库 `DEFAULT 1`）
3. **状态持久化** - 切换状态后立即保存到数据库，永久生效

## 💡 后续优化建议

1. **状态历史记录** - 记录司机每次切换接单状态的时间，用于分析
2. **定时提醒** - 如果司机关闭接单超过 24 小时，发送提醒
3. **自动开启** - 每天凌晨 6 点自动开启接单（可选）
4. **多设备同步** - 司机在多个设备登录时，状态保持同步

---

**修复时间**: 2026-04-08  
**修复人员**: 豆豆 🦞  
**影响范围**: 司机端接单状态持久化
