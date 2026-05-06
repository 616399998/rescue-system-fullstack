# 时间线图片组查看功能 - 实现指南

## ✅ 已完成终端

### 1. 司机端 (`driver.html`) ✅
- ✅ 图片查看弹窗（支持组切换）
- ✅ 左右箭头切换
- ✅ 图片计数显示
- ✅ 缩略图导航
- ✅ 键盘事件支持
- ✅ 所有照片组调用更新

**修改位置**:
- 弹窗 HTML: 第 692-713 行
- JavaScript 函数：第 897-1004 行
- 照片调用：第 1156、1172、1184 行

---

## 📝 待完成终端

### 2. 用户端 (`index.html`)

**需要修改的位置**:

1. **弹窗 HTML** - 搜索 `photoViewModal` 或 `viewPhoto`
2. **JavaScript 函数** - 替换 `viewPhoto` 函数
3. **照片调用** - 时间线中的照片

**修改步骤**:
```javascript
// 1. 替换 viewPhoto 函数为支持组的版本
// 2. 修改所有 viewPhoto('xxx') 为 viewPhoto('xxx', [photos])
```

### 3. 管理端 (`admin.html`)

**需要修改的位置**:

1. **弹窗 HTML** - 搜索 `photoViewModal` 或 `viewPhoto`
2. **JavaScript 函数** - 替换 `viewPhoto` 函数
3. **照片调用** - 订单详情中的照片

---

## 🔧 通用代码模板

### 弹窗 HTML 模板
```html
<div id="photoViewModal" class="modal" onclick="closePhotoModal()">
    <div class="modal-content" style="max-width:900px;position:relative;" onclick="event.stopPropagation()">
        <!-- 切换按钮 -->
        <button id="photoPrevBtn" onclick="prevPhoto()" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);color:white;border:none;border-radius:50%;width:40px;height:40px;font-size:20px;cursor:pointer;display:none;">‹</button>
        <button id="photoNextBtn" onclick="nextPhoto()" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);color:white;border:none;border-radius:50%;width:40px;height:40px;font-size:20px;cursor:pointer;display:none;">›</button>
        
        <!-- 图片 -->
        <img id="photoViewImage" src="" style="width: 100%; max-height:70vh; object-fit:contain; border-radius: 8px;" />
        
        <!-- 图片计数 -->
        <div id="photoCount" style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.6);color:white;padding:5px 10px;border-radius:20px;font-size:12px;display:none;">1/5</div>
        
        <!-- 缩略图导航 -->
        <div id="photoThumbnails" style="margin-top:15px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;display:none;"></div>
        
        <!-- 关闭按钮 -->
        <button class="btn btn-warning" onclick="closePhotoModal()" style="margin-top: 10px;width:100%;">关闭</button>
    </div>
</div>
```

### JavaScript 函数模板
```javascript
let currentPhotoGroup = [];
let currentPhotoIndex = 0;

function viewPhoto(photoUrl, photoGroup = null) {
    const modal = document.getElementById('photoViewModal');
    const img = document.getElementById('photoViewImage');
    const prevBtn = document.getElementById('photoPrevBtn');
    const nextBtn = document.getElementById('photoNextBtn');
    const countDiv = document.getElementById('photoCount');
    const thumbsDiv = document.getElementById('photoThumbnails');
    
    if (photoGroup && photoGroup.length > 0) {
        currentPhotoGroup = photoGroup;
        currentPhotoIndex = photoGroup.indexOf(photoUrl);
        if (currentPhotoIndex === -1) currentPhotoIndex = 0;
        
        updatePhotoDisplay();
        
        prevBtn.style.display = 'block';
        nextBtn.style.display = 'block';
        countDiv.style.display = 'block';
        thumbsDiv.style.display = 'flex';
        
        renderThumbnails();
    } else {
        img.src = photoUrl;
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        countDiv.style.display = 'none';
        thumbsDiv.style.display = 'none';
    }
    
    modal.classList.add('active');
}

function updatePhotoDisplay() {
    const img = document.getElementById('photoViewImage');
    const countDiv = document.getElementById('photoCount');
    
    if (currentPhotoGroup.length > 0) {
        img.src = currentPhotoGroup[currentPhotoIndex];
        countDiv.textContent = `${currentPhotoIndex + 1}/${currentPhotoGroup.length}`;
        updateThumbnails();
    }
}

function prevPhoto() {
    if (currentPhotoIndex > 0) {
        currentPhotoIndex--;
        updatePhotoDisplay();
    }
}

function nextPhoto() {
    if (currentPhotoIndex < currentPhotoGroup.length - 1) {
        currentPhotoIndex++;
        updatePhotoDisplay();
    }
}

function closePhotoModal() {
    document.getElementById('photoViewModal').classList.remove('active');
    currentPhotoGroup = [];
    currentPhotoIndex = 0;
}

function renderThumbnails() {
    const thumbsDiv = document.getElementById('photoThumbnails');
    thumbsDiv.innerHTML = currentPhotoGroup.map((photo, index) => `
        <img src="${photo}" onclick="switchPhoto(${index})" 
            style="width:60px;height:60px;object-fit:cover;border-radius:4px;cursor:pointer;opacity:${index === currentPhotoIndex ? '1' : '0.5'};border:${index === currentPhotoIndex ? '2px solid var(--primary-color)' : '2px solid transparent'}" />
    `).join('');
}

function updateThumbnails() {
    const thumbsDiv = document.getElementById('photoThumbnails');
    if (thumbsDiv.children.length === currentPhotoGroup.length) {
        Array.from(thumbsDiv.children).forEach((thumb, index) => {
            thumb.style.opacity = index === currentPhotoIndex ? '1' : '0.5';
            thumb.style.border = index === currentPhotoIndex ? '2px solid var(--primary-color)' : '2px solid transparent';
        });
    }
}

function switchPhoto(index) {
    currentPhotoIndex = index;
    updatePhotoDisplay();
}

// 键盘事件
document.addEventListener('keydown', function(e) {
    if (document.getElementById('photoViewModal').classList.contains('active')) {
        if (e.key === 'ArrowLeft') prevPhoto();
        else if (e.key === 'ArrowRight') nextPhoto();
        else if (e.key === 'Escape') closePhotoModal();
    }
});
```

### 照片调用模板
```javascript
// 原来：
onclick="viewPhoto('${photo}')"

// 改为：
onclick="viewPhoto('${photo}', ${JSON.stringify(photoArray)})"
```

---

## ✅ 测试清单

### 功能测试
- [ ] 单图查看（无切换按钮）
- [ ] 组图查看（显示切换按钮）
- [ ] 左右箭头切换
- [ ] 缩略图点击切换
- [ ] 键盘左右键切换
- [ ] ESC 键关闭
- [ ] 点击背景关闭
- [ ] 图片计数正确

### 终端测试
- [ ] 用户端 - 订单详情时间线
- [ ] 司机端 - 任务详情时间线
- [ ] 管理端 - 订单详情时间线

---

**完成时间**: 2026-04-08  
**完成人员**: 豆豆 🦞
