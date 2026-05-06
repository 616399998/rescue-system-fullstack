# 后台管理端司机状态切换修复

## 🐛 问题描述

**现象**：后台管理端的司机管理中，"激活"和"下线"功能无法正常工作。

**原因**：
1. 前端 `offlineDriver` 函数调用了错误的接口（`/reject`）
2. 后端没有专门的下线/激活切换接口
3. 下线后无法重新激活司机

## ✅ 修复方案

### 1. 后端新增接口 (`backend/routes/admin.js`)

**新增接口**：`PUT /api/admin/drivers/:id/toggle-status`

```javascript
// 司机下线/激活切换
router.put('/drivers/:id/toggle-status', async (req, res) => {
  try {
    const driverId = req.params.id;
    const { status } = req.body; // 'active' or 'offline'
    
    if (!status || !['active', 'offline'].includes(status)) {
      return res.status(400).json({ error: '状态无效' });
    }
    
    await run('UPDATE drivers SET status = ? WHERE id = ?', [status, driverId]);
    
    const action = status === 'active' ? '激活' : '下线';
    res.json({ success: true, message: `司机已${action}` });
  } catch (error) {
    res.status(500).json({ error: '操作失败' });
  }
});
```

### 2. 前端修复 (`frontend/admin.html`)

**修改前**：
```javascript
async function offlineDriver(driverId) {
    const currentStatus = allDrivers.find(d => d.id === driverId)?.status;
    const action = currentStatus === 'active' ? '下线' : '激活';
    if (!confirm(`确认${action}该司机？`)) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/drivers/${driverId}/reject`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: currentStatus === 'active' ? '管理员下线' : '' })
        });
        // ...
    }
}
```

**修改后**：
```javascript
async function offlineDriver(driverId) {
    const currentStatus = allDrivers.find(d => d.id === driverId)?.status;
    const newStatus = currentStatus === 'active' ? 'offline' : 'active';
    const action = newStatus === 'active' ? '激活' : '下线';
    if (!confirm(`确认${action}该司机？`)) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/drivers/${driverId}/toggle-status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (data.success) {
            alert(`司机已${action}`);
            loadDrivers();
        } else {
            alert(data.error || '操作失败');
        }
    } catch (error) {
        alert('操作失败');
    }
}
```

## 📊 修复效果

### 修复前
```
司机列表：
┌─────────────────────────────────────────┐
│ 司机    │ 状态   │ 操作                  │
├─────────────────────────────────────────┤
│ 王师傅  │ active │ ⬇️ 下线 ❌ 点击无效   │
│ 李师傅  │ offline│ ⬆️ 激活 ❌ 点击无效   │
└─────────────────────────────────────────┘
```

### 修复后
```
司机列表：
┌─────────────────────────────────────────┐
│ 司机    │ 状态   │ 操作                  │
├─────────────────────────────────────────┤
│ 王师傅  │ active │ ⬇️ 下线 ✅ 点击生效   │
│ 李师傅  │ offline│ ⬆️ 激活 ✅ 点击生效   │
└─────────────────────────────────────────┘
```

## 🔧 接口说明

### 司机状态切换接口

**请求**：
```http
PUT /api/admin/drivers/:id/toggle-status
Content-Type: application/json

{
  "status": "active"  // 或 "offline"
}
```

**响应**：
```json
{
  "success": true,
  "message": "司机已激活"
}
```

### 司机状态说明

| 状态 | 说明 | 可接订单 | 显示 |
|------|------|----------|------|
| `active` | 正常运营 | ✅ 可以 | ✅ 显示 |
| `offline` | 已下线 | ❌ 不可以 | ⚠️ 灰色显示 |
| `pending` | 待审核 | ❌ 不可以 | ⏳ 待审核 |

## ✅ 测试清单

- [ ] 点击"⬇️ 下线"按钮，确认提示弹出
- [ ] 确认后司机状态变为 offline
- [ ] 刷新页面后状态保持
- [ ] 点击"⬆️ 激活"按钮，确认提示弹出
- [ ] 确认后司机状态变为 active
- [ ] 刷新页面后状态保持
- [ ] 下线司机不能接单
- [ ] 激活司机可以接单

## 🚀 部署步骤

1. **重启后端服务**
   ```bash
   # 停止服务
   ps aux | grep "node server.js" | grep -v grep | awk '{print $2}' | xargs kill
   
   # 启动服务
   cd backend
   node server.js
   ```

2. **刷新后台页面**
   ```
   https://akesurescue.com/admin.html
   Ctrl + F5 (强制刷新)
   ```

3. **测试功能**
   - 登录后台管理
   - 进入"👨‍✈️ 司机管理"
   - 点击司机的"⬇️ 下线"或"⬆️ 激活"按钮
   - 确认操作生效

## 💡 后续优化建议

1. **批量操作** - 支持批量下线/激活司机
2. **操作日志** - 记录管理员的每次操作
3. **状态筛选** - 按状态筛选司机列表
4. **自动下线** - 长时间不在线自动下线
5. **下线原因** - 记录下线的具体原因

---

**修复时间**: 2026-04-08  
**修复人员**: 豆豆 🦞  
**影响范围**: 后台管理端 - 司机管理
