// ==================== 全局配置 ====================
const API = window.location.origin + '/api/admin';
let token = localStorage.getItem('admin_token') || '';
let currentPage = 'dashboard';
let orderPage = 1, notifPage = 1, auditPage = 1;
const channelMap = { personal: '个人端', traffic: '交管端', enforcement: '执法端', insurance: '保险端' };
const statusMap = { pending: '待处理', processing: '进行中', completed: '已完成', cancelled: '已取消' };
const serviceMap = { accident: '事故拖车', violation: '违法拖车', breakdown: '故障救援', tow: '拖车' };

// ==================== 工具函数 ====================
async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try {
        const res = await fetch(API + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
        if (res.status === 401) { doLogout(); return null; }
        if (opts.raw) return res;
        return await res.json();
    } catch (e) { console.error('API Error:', e); showToast('网络错误', 'error'); return null; }
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast ' + type + ' show';
    setTimeout(() => t.classList.remove('show'), 3000);
}

function fmtDate(d) { return d ? new Date(d).toLocaleString('zh-CN') : '-'; }
function fmtMoney(n) { return '¥' + (Number(n) || 0).toFixed(2); }
function stars(n) { return '⭐'.repeat(n) + '☆'.repeat(5 - n); }
function badge(status) { return '<span class="badge badge-' + status + '">' + (statusMap[status] || status) + '</span>'; }
function badgeCustom(status, text) { return '<span class="badge badge-' + status + '">' + text + '</span>'; }

function openModal(title, bodyHtml, footerHtml) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    document.getElementById('modalFooter').innerHTML = footerHtml || '';
    document.getElementById('modalOverlay').classList.add('active');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('active'); }

function downloadCSV(url) {
    fetch(API + url, { headers: { 'Authorization': 'Bearer ' + token } })
        .then(r => r.blob()).then(b => {
            const u = URL.createObjectURL(b);
            const a = document.createElement('a');
            a.href = u; a.download = url.split('/').pop().split('?')[0] + '.csv';
            a.click(); URL.revokeObjectURL(u);
        }).catch(() => showToast('导出失败', 'error'));
}

function esc(s) { return (s||'').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

// ==================== 登录 ====================
async function doLogin() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const data = await api('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (!data) return;
    if (data.success) {
        token = data.token;
        localStorage.setItem('admin_token', token);
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        document.getElementById('adminName').textContent = data.admin.username;
        loadDashboard();
    } else { showToast(data.error || '登录失败', 'error'); }
}

function doLogout() {
    token = '';
    localStorage.removeItem('admin_token');
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
}

if (token) {
    api('/verify').then(data => {
        if (data && data.success) {
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('app').style.display = 'block';
            document.getElementById('adminName').textContent = data.admin.username;
            loadDashboard();
        } else { doLogout(); }
    });
}

// ==================== 页面切换 ====================
const pageTitles = {
    dashboard:'仪表盘', monitor:'实时监控', orders:'订单管理', drivers:'司机管理',
    vehicles:'车辆管理', approvals:'审批管理', users:'用户管理', customers:'机构客户',
    merchants:'商户管理', finance:'财务报表', ratings:'评价管理', notifications:'消息通知',
    config:'配置中心', 'roles':'角色权限', 'audit-log':'日志审计', sms:'短信网关'
};

function switchPage(page) {
    currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector('.nav-item[data-page="' + page + '"]');
    if (navItem) navItem.classList.add('active');
    document.getElementById('pageTitle').textContent = pageTitles[page] || page;
    
    const loaders = {
        dashboard: loadDashboard, monitor: loadMonitor, orders: () => { orderPage=1; loadOrders(); },
        drivers: loadDrivers, vehicles: loadVehicles, approvals: loadApprovals,
        users: loadUsers, customers: loadCustomers, merchants: loadMerchants,
        finance: loadFinance, ratings: loadRatings, notifications: () => { notifPage=1; loadNotifications(); },
        config: loadConfig, roles: loadRoles, 'audit-log': () => { auditPage=1; loadAuditLog(); },
        sms: loadSms
    };
    if (loaders[page]) loaders[page]();
}

// ==================== 仪表盘 ====================
let trendChart1 = null, trendChart2 = null;

async function loadDashboard() {
    const data = await api('/stats');
    if (!data) return;
    document.getElementById('dashStats').innerHTML = 
        '<div class="stat-card"><div class="label">总订单</div><div class="value blue">' + data.totalOrders + '</div><div class="sub">今日 +' + data.todayOrders + '</div></div>' +
        '<div class="stat-card"><div class="label">待处理</div><div class="value orange">' + data.pendingOrders + '</div></div>' +
        '<div class="stat-card"><div class="label">进行中</div><div class="value blue">' + data.processingOrders + '</div></div>' +
        '<div class="stat-card"><div class="label">已完成</div><div class="value green">' + data.completedOrders + '</div></div>' +
        '<div class="stat-card"><div class="label">总营收</div><div class="value green">' + fmtMoney(data.totalRevenue) + '</div><div class="sub">今日 ' + fmtMoney(data.todayRevenue) + '</div></div>' +
        '<div class="stat-card"><div class="label">注册用户</div><div class="value blue">' + (data.totalUsers||0) + '</div></div>' +
        '<div class="stat-card"><div class="label">在线司机</div><div class="value blue">' + (data.totalDrivers||0) + '</div></div>' +
        '<div class="stat-card"><div class="label">运营车辆</div><div class="value blue">' + (data.totalVehicles||0) + '</div></div>';

    const finance = await api('/finance/report');
    if (!finance || !finance.dailyStats) return;
    const stats = finance.dailyStats.slice().reverse();
    const labels = stats.map(s => s.date);

    if (trendChart1) trendChart1.destroy();
    if (trendChart2) trendChart2.destroy();
    trendChart1 = new Chart(document.getElementById('orderTrendChart'), {
        type: 'bar', data: { labels, datasets: [
            { label: '总订单', data: stats.map(s => s.orders), backgroundColor: '#818cf8' },
            { label: '已完成', data: stats.map(s => s.completed), backgroundColor: '#34d399' }
        ]}, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
    trendChart2 = new Chart(document.getElementById('revenueTrendChart'), {
        type: 'line', data: { labels, datasets: [
            { label: '收入', data: stats.map(s => s.revenue || 0), borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,.1)', fill: true, tension: .3 }
        ]}, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
    });
}

// ==================== 实时监控 ====================
var monitorMap = null;
var monitorInterval = null;

async function loadMonitor() {
    const rt = await api('/stats/realtime');
    if (!rt) return;
    document.getElementById('monitorStats').innerHTML =
        '<div class="stat-card"><div class="label">在线司机</div><div class="value green">' + rt.onlineDrivers + '</div></div>' +
        '<div class="stat-card"><div class="label">进行中订单</div><div class="value blue">' + rt.processingOrders.length + '</div></div>' +
        '<div class="stat-card"><div class="label">待处理订单</div><div class="value orange">' + rt.pendingOrders + '</div></div>' +
        '<div class="stat-card"><div class="label">今日完成</div><div class="value green">' + rt.todayCompleted + '</div></div>' +
        '<div class="stat-card"><div class="label">今日营收</div><div class="value green">' + fmtMoney(rt.todayRevenue) + '</div></div>';

    // 进行中订单表
    const otb = document.getElementById('monitorOrdersTable');
    if (rt.processingOrders.length) {
        otb.innerHTML = rt.processingOrders.map(o => 
            '<tr><td>' + o.order_no + '</td><td>' + (o.driver_name||'-') + '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">' + (o.current_location||'-') + '</td><td>' + badge(o.status) + '</td></tr>'
        ).join('');
    } else { otb.innerHTML = '<tr class="empty-row"><td colspan="4">暂无进行中订单</td></tr>'; }

    // 司机位置
    const drivers = await api('/monitor/drivers');
    if (!drivers || !drivers.drivers) return;
    const dtb = document.getElementById('monitorDriversTable');
    if (drivers.drivers.length) {
        dtb.innerHTML = drivers.drivers.map(d =>
            '<tr><td>' + d.name + '</td><td>' + d.phone + '</td><td>' + badgeCustom(d.is_online ? 'active' : 'offline', d.is_online ? '在线' : '离线') + '</td><td>' + d.active_orders + '</td><td>' + fmtDate(d.last_location_update) + '</td></tr>'
        ).join('');
    } else { dtb.innerHTML = '<tr class="empty-row"><td colspan="5">暂无在线司机</td></tr>'; }

    // 地图
    setTimeout(function() {
        var mc = document.getElementById('driverMap');
        if (!mc) return;
        if (typeof qq === 'undefined' || typeof qq.maps === 'undefined') {
            mc.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text2);">地图 API 加载中...</div>';
            return;
        }
        if (monitorMap) { monitorMap = null; }
        monitorMap = new qq.maps.Map(mc, { center: new qq.maps.LatLng(39.9042, 116.4074), zoom: 11 });
        drivers.drivers.forEach(function(d) {
            if (d.latitude && d.longitude) {
                var marker = new qq.maps.Marker({
                    position: new qq.maps.LatLng(d.latitude, d.longitude),
                    map: monitorMap,
                    title: d.name + (d.is_online ? ' (在线)' : ' (离线)')
                });
                var info = new qq.maps.InfoWindow({ map: monitorMap, content: '<b>' + d.name + '</b><br>手机: ' + d.phone + '<br>进行中: ' + d.active_orders + ' 单' });
                qq.maps.event.addListener(marker, 'click', function() { info.open(monitorMap, marker); });
            }
        });
    }, 400);

    // 自动刷新 30s
    if (monitorInterval) clearInterval(monitorInterval);
    monitorInterval = setInterval(loadMonitor, 30000);
}

// ==================== 订单管理 ====================
async function loadOrders() {
    const keyword = document.getElementById('orderSearch').value;
    const status = document.getElementById('orderStatusFilter').value;
    const channel = document.getElementById('orderChannelFilter').value;
    const data = await api('/orders?page=' + orderPage + '&limit=20&keyword=' + encodeURIComponent(keyword) + '&status=' + status + '&channel=' + channel);
    if (!data) return;
    const tbody = document.getElementById('ordersTable');
    if (!data.orders || data.orders.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="11">暂无订单</td></tr>';
        document.getElementById('ordersPagination').innerHTML = '';
        return;
    }
    tbody.innerHTML = data.orders.map(function(o) {
        return '<tr><td>' + o.order_no + '</td><td>' + (channelMap[o.channel]||'个人端') + '</td><td>' + badge(o.status) + '</td><td>' + (serviceMap[o.service_type]||o.service_type) + '</td><td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;" title="' + esc(o.current_location) + '">' + o.current_location + '</td><td>' + (o.vehicle_plate||'-') + '</td><td>' + (o.owner_name||'-') + '</td><td>' + fmtMoney(o.price) + '</td><td>' + (o.driver ? o.driver.name : '-') + '</td><td>' + fmtDate(o.created_at) + '</td><td><button class="btn btn-sm btn-outline" onclick="viewOrder(' + o.id + ')">详情</button>' + (o.status==='pending' ? ' <button class="btn btn-sm btn-primary" onclick="dispatchOrder(' + o.id + ')">派单</button>' : '') + (o.status==='processing' ? ' <button class="btn btn-sm btn-warning" onclick="interveneOrder(' + o.id + ')">干预</button> <button class="btn btn-sm btn-success" onclick="completeOrder(' + o.id + ')">完成</button>' : '') + '</td></tr>';
    }).join('');

    var total = data.total || 0, pages = Math.ceil(total / 20), pgHtml = '';
    if (pages > 1) {
        pgHtml += '<button ' + (orderPage<=1?'disabled':'') + ' onclick="orderPage--;loadOrders()">上一页</button>';
        for (var i = 1; i <= Math.min(pages,10); i++) pgHtml += '<button class="' + (i===orderPage?'active':'') + '" onclick="orderPage=' + i + ';loadOrders()">' + i + '</button>';
        pgHtml += '<span style="font-size:12px;color:var(--text2);margin:0 8px;">共 ' + total + ' 条</span>';
        pgHtml += '<button ' + (orderPage>=pages?'disabled':'') + ' onclick="orderPage++;loadOrders()">下一页</button>';
    }
    document.getElementById('ordersPagination').innerHTML = pgHtml;
}

var currentPhotoGroup = [];
var currentPhotoIndex = 0;

async function viewOrder(id) {
    var data = await api('/orders/' + id);
    if (!data || !data.order) return;
    var o = data.order;

    var photoHtml = '';
    if (o.photos && o.photos.length > 0) {
        photoHtml = '<div style="margin:12px 0;"><strong>📷 现场照片</strong><div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">';
        o.photos.forEach(function(p, i) {
            var url = p.startsWith('http') ? p : (p.startsWith('/uploads') ? p : window.location.origin + p);
            photoHtml += '<img src="' + url + '" style="width:80px;height:80px;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid var(--border);" onclick="viewPhotoGroup(' + JSON.stringify(o.photos).replace(/"/g, '&quot;') + ',' + i + ')">';
        });
        photoHtml += '</div></div>';
    }

    var mapHtml = '<div style="margin:12px 0;"><strong>📍 路线地图</strong><div id="orderMap" style="width:100%;height:250px;border-radius:8px;margin-top:8px;border:1px solid var(--border);"></div></div>';

    var timelineHtml = '';
    if (o.timeline && o.timeline.length) {
        timelineHtml = '<div style="margin:12px 0;"><strong>📋 时间线</strong><div class="timeline" style="margin-top:8px;">' +
            o.timeline.map(function(t){ return '<div class="timeline-item"><div class="timeline-time">' + t.time + '</div><div class="timeline-content">' + t.content + '</div></div>'; }).join('') +
            '</div></div>';
    }

    var settleHtml = '';
    if (o.tow_fee || o.mileage_fee || o.extra_fee) {
        settleHtml = '<div style="background:#f8fafc;border-radius:8px;padding:12px;margin:12px 0;"><strong>💰 结算明细</strong><br>拖车费：¥' + (o.tow_fee||0) + ' | 里程费：¥' + (o.mileage_fee||0) + ' | 附加费：¥' + (o.extra_fee||0) + ' | <strong>总计：¥' + (o.total_fee||o.price) + '</strong></div>';
    }

    var body = '<div class="detail-grid">' +
        '<div class="detail-item"><div class="dt">订单号</div><div class="dd">' + o.order_no + '</div></div>' +
        '<div class="detail-item"><div class="dt">状态</div><div class="dd">' + badge(o.status) + '</div></div>' +
        '<div class="detail-item"><div class="dt">渠道</div><div class="dd">' + (channelMap[o.channel]||'个人端') + '</div></div>' +
        '<div class="detail-item"><div class="dt">服务类型</div><div class="dd">' + (serviceMap[o.service_type]||o.service_type) + '</div></div>' +
        '<div class="detail-item"><div class="dt">价格</div><div class="dd">' + fmtMoney(o.price) + '</div></div>' +
        '<div class="detail-item"><div class="dt">车牌号</div><div class="dd">' + (o.vehicle_plate||'-') + '</div></div>' +
        '<div class="detail-item"><div class="dt">当前位置</div><div class="dd">' + o.current_location + '</div></div>' +
        '<div class="detail-item"><div class="dt">目的地</div><div class="dd">' + (o.destination||'-') + '</div></div>' +
        '<div class="detail-item"><div class="dt">车主</div><div class="dd">' + (o.owner_name||'-') + '</div></div>' +
        '<div class="detail-item"><div class="dt">联系电话</div><div class="dd">' + (o.owner_phone||'-') + '</div></div>' +
        (o.problem_description ? '<div class="detail-item" style="grid-column:span 2"><div class="dt">问题描述</div><div class="dd">' + o.problem_description + '</div></div>' : '') +
        '</div>' +
        (o.driver ? '<div style="background:#f8fafc;border-radius:8px;padding:12px;margin:12px 0;"><strong>🚗 司机：</strong>' + o.driver.name + ' | ' + o.driver.phone + ' | ⭐' + (o.driver.rating||'-') + ' | ' + (o.driver.vehicle_plate||'-') + ' ' + (o.driver.vehicle_model||'') + '</div>' : '') +
        settleHtml + photoHtml + mapHtml + timelineHtml;

    openModal('订单详情 - ' + o.order_no, body, '<button class="btn btn-outline" onclick="closeModal()">关闭</button>');
    setTimeout(function() { initOrderMap(o); }, 400);
}

function viewPhotoGroup(photos, index) {
    currentPhotoGroup = photos;
    currentPhotoIndex = index || 0;
    var overlay = document.createElement('div');
    overlay.id = 'photoOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:2000;display:flex;align-items:center;justify-content:center;flex-direction:column;';
    updatePhotoDisplay(overlay);
    document.body.appendChild(overlay);
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
}

function updatePhotoDisplay(overlay) {
    if (!overlay) overlay = document.getElementById('photoOverlay');
    if (!overlay || !currentPhotoGroup.length) return;
    var p = currentPhotoGroup[currentPhotoIndex];
    var url = p.startsWith('http') ? p : (p.startsWith('/uploads') ? p : window.location.origin + p);
    overlay.innerHTML = '<div style="position:relative;">' +
        '<img src="' + url + '" style="max-width:90vw;max-height:70vh;object-fit:contain;border-radius:8px;">' +
        (currentPhotoGroup.length > 1 ? '<button onclick="event.stopPropagation();prevPhoto()" style="position:absolute;left:-50px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.2);color:#fff;border:none;border-radius:50%;width:40px;height:40px;font-size:20px;cursor:pointer;">‹</button><button onclick="event.stopPropagation();nextPhoto()" style="position:absolute;right:-50px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.2);color:#fff;border:none;border-radius:50%;width:40px;height:40px;font-size:20px;cursor:pointer;">›</button>' : '') +
        '</div>' +
        '<div style="color:#fff;margin-top:12px;font-size:14px;">' + (currentPhotoIndex+1) + ' / ' + currentPhotoGroup.length + '</div>' +
        '<div style="margin-top:12px;display:flex;gap:8px;">' + currentPhotoGroup.map(function(ph, i) {
            var u = ph.startsWith('http') ? ph : (ph.startsWith('/uploads') ? ph : window.location.origin + ph);
            return '<img src="' + u + '" style="width:48px;height:48px;object-fit:cover;border-radius:6px;cursor:pointer;opacity:' + (i===currentPhotoIndex?'1':'.5') + ';border:' + (i===currentPhotoIndex?'2px solid #fff':'1px solid rgba(255,255,255,.3)') + ';" onclick="event.stopPropagation();currentPhotoIndex=' + i + ';updatePhotoDisplay();">';
        }).join('') + '</div>';
}

function prevPhoto() { if (currentPhotoIndex > 0) { currentPhotoIndex--; updatePhotoDisplay(); } }
function nextPhoto() { if (currentPhotoIndex < currentPhotoGroup.length - 1) { currentPhotoIndex++; updatePhotoDisplay(); } }

var orderTencentMap = null;
function initOrderMap(order) {
    var mapContainer = document.getElementById('orderMap');
    if (!mapContainer) return;
    if (typeof qq === 'undefined' || typeof qq.maps === 'undefined') {
        mapContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text2);font-size:13px;">地图 API 加载中...</div>';
        return;
    }
    var lat = 39.9042, lng = 116.4074;
    if (order.address && typeof order.address === 'string' && order.address.includes(',')) {
        var coords = order.address.split(',');
        if (coords.length === 2) { lat = parseFloat(coords[0]); lng = parseFloat(coords[1]); }
    }
    orderTencentMap = new qq.maps.Map(mapContainer, { center: new qq.maps.LatLng(lat, lng), zoom: 13 });
    new qq.maps.Marker({ position: new qq.maps.LatLng(lat, lng), map: orderTencentMap, title: '起点：' + order.current_location });
    if (order.destination_coord && typeof order.destination_coord === 'string' && order.destination_coord.includes(',')) {
        var dc = order.destination_coord.split(',');
        if (dc.length === 2) {
            var toLat = parseFloat(dc[0]), toLng = parseFloat(dc[1]);
            new qq.maps.Marker({ position: new qq.maps.LatLng(toLat, toLng), map: orderTencentMap, title: '终点：' + order.destination });
            var bounds = new qq.maps.LatLngBounds();
            bounds.extend(new qq.maps.LatLng(lat, lng));
            bounds.extend(new qq.maps.LatLng(toLat, toLng));
            orderTencentMap.fitBounds(bounds);
        }
    }
}

async function dispatchOrder(orderId) {
    var data = await api('/dispatch/available-drivers');
    if (!data || !data.drivers || !data.drivers.length) { showToast('暂无可派司机', 'error'); return; }
    var opts = data.drivers.map(function(d){ return '<option value="' + d.id + '" data-name="' + esc(d.name) + '" data-phone="' + d.phone + '" data-rating="' + d.rating + '">' + d.name + ' | ⭐' + d.rating + ' | ' + d.status + '</option>'; }).join('');
    var body = '<div class="form-group"><label>选择司机</label><select id="dispatchDriverId" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;">' + opts + '</select></div>' +
        '<div class="form-group"><label>救援车辆车牌</label><input id="dispatchVehiclePlate"></div>' +
        '<div class="form-group"><label>车辆型号</label><input id="dispatchVehicleModel"></div>';
    openModal('派单', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doDispatch(' + orderId + ')">确认派单</button>');
}

async function doDispatch(orderId) {
    var sel = document.getElementById('dispatchDriverId');
    var opt = sel.selectedOptions[0];
    var body = { driver_id: parseInt(sel.value), driver_name: opt.dataset.name, driver_phone: opt.dataset.phone, driver_rating: parseFloat(opt.dataset.rating), vehicle_plate: document.getElementById('dispatchVehiclePlate').value, vehicle_model: document.getElementById('dispatchVehicleModel').value };
    var data = await api('/orders/' + orderId + '/dispatch', { method: 'PUT', body: JSON.stringify(body) });
    if (data && data.success) { showToast('派单成功'); closeModal(); loadOrders(); }
    else showToast(data ? data.error : '派单失败', 'error');
}

async function completeOrder(orderId) {
    if (!confirm('确认完成该订单？')) return;
    var data = await api('/orders/' + orderId + '/status', { method: 'PUT', body: JSON.stringify({ status: 'completed' }) });
    if (data && data.success) { showToast('订单已完成'); loadOrders(); }
    else showToast(data ? data.error : '操作失败', 'error');
}

// 异常干预
async function interveneOrder(orderId) {
    var body = '<div class="form-group"><label>干预操作</label><select id="interveneAction" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;" onchange="onInterveneActionChange()"><option value="reassign">重新派单</option><option value="force_cancel">强制取消</option><option value="force_complete">强制完成</option></select></div>' +
        '<div class="form-group" id="reassignGroup"><label>新司机</label><select id="interveneDriverId" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"></select></div>' +
        '<div class="form-group"><label>原因</label><input id="interveneReason" placeholder="填写干预原因"></div>';
    openModal('异常干预', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-warning" onclick="doIntervene(' + orderId + ')">确认干预</button>');
    // 加载司机列表
    var dData = await api('/dispatch/available-drivers');
    if (dData && dData.drivers) {
        document.getElementById('interveneDriverId').innerHTML = dData.drivers.map(d => '<option value="' + d.id + '">' + d.name + ' | ⭐' + d.rating + '</option>').join('');
    }
}

function onInterveneActionChange() {
    var action = document.getElementById('interveneAction').value;
    document.getElementById('reassignGroup').style.display = action === 'reassign' ? 'block' : 'none';
}

async function doIntervene(orderId) {
    var action = document.getElementById('interveneAction').value;
    var reason = document.getElementById('interveneReason').value;
    var body = { action: action, reason: reason };
    if (action === 'reassign') body.new_driver_id = parseInt(document.getElementById('interveneDriverId').value);
    var data = await api('/orders/' + orderId + '/intervene', { method: 'PUT', body: JSON.stringify(body) });
    if (data && data.success) { showToast('干预成功'); closeModal(); loadOrders(); }
    else showToast(data ? data.error : '干预失败', 'error');
}

// 归档
async function archiveOrders() {
    var days = prompt('归档多少天前的已完成/已取消订单？', '90');
    if (days === null) return;
    var data = await api('/orders/archive', { method: 'POST', body: JSON.stringify({ days: parseInt(days) }) });
    if (data && data.success) showToast(data.message);
    else showToast(data ? data.error : '归档失败', 'error');
}

function exportOrders() {
    var keyword = document.getElementById('orderSearch').value;
    var status = document.getElementById('orderStatusFilter').value;
    downloadCSV('/orders/export?keyword=' + encodeURIComponent(keyword) + '&status=' + status);
}

// ==================== 司机管理 ====================
async function loadDrivers() {
    var keyword = document.getElementById('driverSearch').value;
    var status = document.getElementById('driverStatusFilter').value;
    var data = await api('/drivers?keyword=' + encodeURIComponent(keyword) + '&status=' + status);
    if (!data) return;
    var tbody = document.getElementById('driversTable');
    if (!data.drivers || !data.drivers.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="9">暂无司机</td></tr>'; return; }
    tbody.innerHTML = data.drivers.map(function(d) {
        return '<tr><td>' + d.id + '</td><td>' + d.name + '</td><td>' + d.phone + '</td><td>' + (d.license_no||'-') + '</td><td>' + (d.qualification_no||'-') + '</td><td>⭐' + d.rating + '</td><td>' + d.total_orders + '</td><td>' + badgeCustom(d.status, d.status_text) + '</td><td>' + (d.status==='active' ? '<button class="btn btn-sm btn-warning" onclick="toggleDriver(' + d.id + ',\'offline\')">下线</button>' : '<button class="btn btn-sm btn-success" onclick="toggleDriver(' + d.id + ',\'active\')">激活</button>') + ' <button class="btn btn-sm btn-outline" onclick="editDriver(' + d.id + ',\'' + esc(d.name) + '\',\'' + d.phone + '\',\'' + esc(d.license_no) + '\',\'' + esc(d.qualification_no) + '\')">编辑</button></td></tr>';
    }).join('');
}

async function toggleDriver(id, status) {
    var data = await api('/drivers/' + id + '/toggle-status', { method: 'PUT', body: JSON.stringify({ status: status }) });
    if (data && data.success) { showToast(data.message); loadDrivers(); }
}

function showAddDriverModal() {
    var body = '<div class="form-row"><div class="form-group"><label>姓名</label><input id="dName"></div><div class="form-group"><label>手机号</label><input id="dPhone"></div></div><div class="form-row"><div class="form-group"><label>驾驶证号</label><input id="dLicense"></div><div class="form-group"><label>资格证号</label><input id="dQual"></div></div>';
    openModal('添加司机', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-success" onclick="doAddDriver()">添加</button>');
}

async function doAddDriver() {
    var body = { name: document.getElementById('dName').value, phone: document.getElementById('dPhone').value, license_no: document.getElementById('dLicense').value, qualification_no: document.getElementById('dQual').value };
    if (!body.name || !body.phone) { showToast('姓名和手机号必填', 'error'); return; }
    var data = await api('/drivers', { method: 'POST', body: JSON.stringify(body) });
    if (data && data.success) { showToast('添加成功'); closeModal(); loadDrivers(); }
    else showToast(data ? data.error : '添加失败', 'error');
}

function editDriver(id, name, phone, license, qual) {
    var body = '<div class="form-row"><div class="form-group"><label>姓名</label><input id="eDName" value="' + name + '"></div><div class="form-group"><label>手机号</label><input id="eDPhone" value="' + phone + '"></div></div><div class="form-row"><div class="form-group"><label>驾驶证号</label><input id="eDLicense" value="' + license + '"></div><div class="form-group"><label>资格证号</label><input id="eDQual" value="' + qual + '"></div></div>';
    openModal('编辑司机', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doEditDriver(' + id + ')">保存</button>');
}

async function doEditDriver(id) {
    var body = { name: document.getElementById('eDName').value, phone: document.getElementById('eDPhone').value, license_no: document.getElementById('eDLicense').value, qualification_no: document.getElementById('eDQual').value };
    var data = await api('/drivers/' + id, { method: 'PUT', body: JSON.stringify(body) });
    if (data && data.success) { showToast('修改成功'); closeModal(); loadDrivers(); }
}

// ==================== 车辆管理 ====================
async function loadVehicles() {
    var keyword = document.getElementById('vehicleSearch').value;
    var type = document.getElementById('vehicleTypeFilter').value;
    var status = document.getElementById('vehicleStatusFilter').value;
    var data = await api('/vehicles?keyword=' + encodeURIComponent(keyword) + '&type=' + type + '&status=' + status);
    if (!data) return;
    var tbody = document.getElementById('vehiclesTable');
    if (!data.vehicles || !data.vehicles.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="10">暂无车辆</td></tr>'; return; }
    var typeMap = { tow: '拖车', flatbed: '平板车', crane: '吊车' };
    var vStatus = { active: '正常', maintenance: '维修中', retired: '已报废' };
    tbody.innerHTML = data.vehicles.map(function(v) {
        return '<tr><td>' + v.plate_no + '</td><td>' + (v.model||'-') + '</td><td>' + (typeMap[v.type]||v.type) + '</td><td>' + (v.device_no||'-') + '</td><td>' + (v.insurance_no||'-') + '</td><td>' + (v.insurance_expiry||'-') + '</td><td>' + v.mileage + 'km</td><td>' + badgeCustom(v.status, vStatus[v.status]||v.status) + '</td><td>' + (v.driver_name||'-') + '</td><td><button class="btn btn-sm btn-outline" onclick="editVehicle(' + v.id + ')">编辑</button></td></tr>';
    }).join('');
}

function showAddVehicleModal() {
    var body = '<div class="form-row"><div class="form-group"><label>车牌号 *</label><input id="vPlate"></div><div class="form-group"><label>型号</label><input id="vModel"></div></div><div class="form-row"><div class="form-group"><label>类型</label><select id="vType" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"><option value="tow">拖车</option><option value="flatbed">平板车</option><option value="crane">吊车</option></select></div><div class="form-group"><label>设备号</label><input id="vDevice"></div></div><div class="form-row"><div class="form-group"><label>保险单号</label><input id="vInsurance"></div><div class="form-group"><label>关联司机ID</label><input id="vDriverId" type="number"></div></div>';
    openModal('添加车辆', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-success" onclick="doAddVehicle()">添加</button>');
}

async function doAddVehicle() {
    var body = { plate_no: document.getElementById('vPlate').value, model: document.getElementById('vModel').value, type: document.getElementById('vType').value, device_no: document.getElementById('vDevice').value, insurance_no: document.getElementById('vInsurance').value, driver_id: document.getElementById('vDriverId').value ? parseInt(document.getElementById('vDriverId').value) : null };
    if (!body.plate_no) { showToast('车牌号必填', 'error'); return; }
    var data = await api('/vehicles', { method: 'POST', body: JSON.stringify(body) });
    if (data && data.success) { showToast('添加成功'); closeModal(); loadVehicles(); }
    else showToast(data ? data.error : '添加失败', 'error');
}

function editVehicle(id) {
    api('/vehicles').then(function(data) {
        if (!data || !data.vehicles) return;
        var v = data.vehicles.find(function(x) { return x.id === id; });
        if (!v) return;
        var body = '<div class="form-row"><div class="form-group"><label>车牌号</label><input id="evPlate" value="' + v.plate_no + '"></div><div class="form-group"><label>型号</label><input id="evModel" value="' + (v.model||'') + '"></div></div><div class="form-row"><div class="form-group"><label>类型</label><select id="evType" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"><option value="tow"' + (v.type==='tow'?' selected':'') + '>拖车</option><option value="flatbed"' + (v.type==='flatbed'?' selected':'') + '>平板车</option><option value="crane"' + (v.type==='crane'?' selected':'') + '>吊车</option></select></div><div class="form-group"><label>设备号</label><input id="evDevice" value="' + (v.device_no||'') + '"></div></div><div class="form-row"><div class="form-group"><label>保险单号</label><input id="evInsurance" value="' + (v.insurance_no||'') + '"></div><div class="form-group"><label>状态</label><select id="evStatus" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"><option value="active"' + (v.status==='active'?' selected':'') + '>正常</option><option value="maintenance"' + (v.status==='maintenance'?' selected':'') + '>维修中</option><option value="retired"' + (v.status==='retired'?' selected':'') + '>已报废</option></select></div></div><div class="form-row"><div class="form-group"><label>保险到期</label><input id="evInsExpiry" type="date" value="' + (v.insurance_expiry||'') + '"></div><div class="form-group"><label>年检到期</label><input id="evInspExpiry" type="date" value="' + (v.inspection_expiry||'') + '"></div></div><div class="form-row"><div class="form-group"><label>里程(km)</label><input id="evMileage" type="number" value="' + (v.mileage||0) + '"></div><div class="form-group"><label>关联司机ID</label><input id="evDriverId" type="number" value="' + (v.driver_id||'') + '"></div></div>';
        openModal('编辑车辆', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doEditVehicle(' + id + ')">保存</button>');
    });
}

async function doEditVehicle(id) {
    var body = { plate_no: document.getElementById('evPlate').value, model: document.getElementById('evModel').value, type: document.getElementById('evType').value, device_no: document.getElementById('evDevice').value, insurance_no: document.getElementById('evInsurance').value, insurance_expiry: document.getElementById('evInsExpiry').value, inspection_expiry: document.getElementById('evInspExpiry').value, mileage: parseInt(document.getElementById('evMileage').value)||0, driver_id: document.getElementById('evDriverId').value ? parseInt(document.getElementById('evDriverId').value) : null, status: document.getElementById('evStatus').value };
    var data = await api('/vehicles/' + id, { method: 'PUT', body: JSON.stringify(body) });
    if (data && data.success) { showToast('修改成功'); closeModal(); loadVehicles(); }
}

function exportVehicles() { downloadCSV('/vehicles/export'); }

// ==================== 审批管理 ====================
async function loadApprovals() {
    var type = document.getElementById('approvalTypeFilter').value;
    var status = document.getElementById('approvalStatusFilter').value;
    var data = await api('/approvals?type=' + type + '&status=' + status);
    if (!data) return;
    var tbody = document.getElementById('approvalsTable');
    if (!data.approvals || !data.approvals.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="9">暂无审批记录</td></tr>'; return; }
    var typeMap = { fuel: '加油', maintenance: '维修保养', other: '其他' };
    var statusMap2 = { pending: '待审批', approved: '已通过', rejected: '已驳回' };
    tbody.innerHTML = data.approvals.map(function(a) {
        return '<tr><td>' + a.id + '</td><td>' + (typeMap[a.type]||a.type) + '</td><td>' + (a.plate_no||'-') + ' ' + (a.model||'') + '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">' + (a.description||'-') + '</td><td>' + fmtMoney(a.cost) + '</td><td>' + (a.applicant_name||'-') + '</td><td>' + badgeCustom(a.status, statusMap2[a.status]||a.status) + '</td><td>' + fmtDate(a.created_at) + '</td><td>' + (a.status === 'pending' ? '<button class="btn btn-sm btn-success" onclick="doApprove(' + a.id + ',\'approve\')">通过</button> <button class="btn btn-sm btn-danger" onclick="doApprove(' + a.id + ',\'reject\')">驳回</button>' : '-') + '</td></tr>';
    }).join('');
}

async function doApprove(id, action) {
    var reason = action === 'reject' ? prompt('驳回原因：') : '';
    if (action === 'reject' && reason === null) return;
    var data = await api('/approvals/' + id, { method: 'PUT', body: JSON.stringify({ action: action, reason: reason || '' }) });
    if (data && data.success) { showToast(data.message); loadApprovals(); }
    else showToast(data ? data.error : '操作失败', 'error');
}

// ==================== 用户管理 ====================
async function loadUsers() {
    var keyword = document.getElementById('userSearch').value;
    var data = await api('/users?keyword=' + encodeURIComponent(keyword));
    if (!data) return;
    var tbody = document.getElementById('usersTable');
    if (!data.users || !data.users.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="10">暂无用户</td></tr>'; return; }
    tbody.innerHTML = data.users.map(function(u) {
        return '<tr><td>' + u.id + '</td><td>' + u.username + '</td><td>' + (u.phone||'-') + '</td><td>' + fmtMoney(u.balance) + '</td><td>' + u.points + '</td><td>' + u.level + '</td><td>' + u.orders + '</td><td>' + fmtMoney(u.total_spent) + '</td><td>' + fmtDate(u.created_at) + '</td><td><button class="btn btn-sm btn-outline" onclick="viewUser(' + u.id + ')">详情</button> <button class="btn btn-sm btn-warning" onclick="adjustBalance(' + u.id + ',' + u.balance + ')">调余额</button></td></tr>';
    }).join('');
}

async function viewUser(id) {
    var data = await api('/users/' + id);
    if (!data || !data.user) return;
    var u = data.user;
    var body = '<div class="detail-grid">' +
        '<div class="detail-item"><div class="dt">ID</div><div class="dd">' + u.id + '</div></div>' +
        '<div class="detail-item"><div class="dt">用户名</div><div class="dd">' + u.username + '</div></div>' +
        '<div class="detail-item"><div class="dt">手机号</div><div class="dd">' + (u.phone||'-') + '</div></div>' +
        '<div class="detail-item"><div class="dt">余额</div><div class="dd">' + fmtMoney(u.balance) + '</div></div>' +
        '<div class="detail-item"><div class="dt">积分</div><div class="dd">' + u.points + '</div></div>' +
        '<div class="detail-item"><div class="dt">等级</div><div class="dd">' + u.level + '</div></div>' +
        '<div class="detail-item"><div class="dt">订单数</div><div class="dd">' + u.total_orders + '</div></div>' +
        '<div class="detail-item"><div class="dt">总消费</div><div class="dd">' + fmtMoney(u.total_spent) + '</div></div>' +
        '</div>';
    if (u.recent_orders && u.recent_orders.length) {
        body += '<h4 style="margin:16px 0 8px;">近期订单</h4><table><thead><tr><th>订单号</th><th>状态</th><th>价格</th><th>时间</th></tr></thead><tbody>' +
            u.recent_orders.map(function(o) { return '<tr><td>' + o.order_no + '</td><td>' + badge(o.status) + '</td><td>' + fmtMoney(o.price) + '</td><td>' + fmtDate(o.created_at) + '</td></tr>'; }).join('') + '</tbody></table>';
    }
    openModal('用户详情', body, '<button class="btn btn-outline" onclick="closeModal()">关闭</button>');
}

function adjustBalance(id, current) {
    var body = '<div class="form-group"><label>当前余额：' + fmtMoney(current) + '</label></div><div class="form-group"><label>调整金额（正数增加，负数减少）</label><input id="adjAmount" type="number" step="0.01"></div><div class="form-group"><label>备注</label><input id="adjReason"></div>';
    openModal('调整余额', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doAdjustBalance(' + id + ')">确认</button>');
}

async function doAdjustBalance(id) {
    var amount = document.getElementById('adjAmount').value;
    var reason = document.getElementById('adjReason').value;
    if (!amount) { showToast('请输入金额', 'error'); return; }
    var data = await api('/users/' + id + '/balance', { method: 'PUT', body: JSON.stringify({ amount: parseFloat(amount), reason: reason }) });
    if (data && data.success) { showToast(data.message); closeModal(); loadUsers(); }
    else showToast(data ? data.error : '操作失败', 'error');
}

function exportUsers() { downloadCSV('/users/export'); }

// ==================== 机构客户 ====================
async function loadCustomers() {
    var keyword = document.getElementById('customerSearch').value;
    var data = await api('/customers?keyword=' + encodeURIComponent(keyword));
    if (!data) return;
    var tbody = document.getElementById('customersTable');
    if (!data.customers || !data.customers.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="8">暂无客户</td></tr>'; return; }
    tbody.innerHTML = data.customers.map(function(c) {
        return '<tr><td>' + c.id + '</td><td>' + c.name + '</td><td>' + (c.contact_name||'-') + '</td><td>' + (c.contact_phone||'-') + '</td><td>' + (c.address||'-') + '</td><td>' + (c.default_destination||'-') + '</td><td>' + c.order_count + '</td><td><button class="btn btn-sm btn-outline" onclick="editCustomer(' + c.id + ',\'' + esc(c.name) + '\',\'' + esc(c.contact_name) + '\',\'' + esc(c.contact_phone) + '\',\'' + esc(c.address) + '\',\'' + esc(c.default_destination) + '\')">编辑</button> <button class="btn btn-sm btn-danger" onclick="deleteCustomer(' + c.id + ')">删除</button></td></tr>';
    }).join('');
}

function showAddCustomerModal() {
    var body = '<div class="form-group"><label>客户名称 *</label><input id="cName"></div><div class="form-row"><div class="form-group"><label>联系人</label><input id="cContact"></div><div class="form-group"><label>联系电话</label><input id="cPhone"></div></div><div class="form-group"><label>地址</label><input id="cAddr"></div><div class="form-group"><label>默认目的地</label><input id="cDest"></div>';
    openModal('添加客户', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-success" onclick="doAddCustomer()">添加</button>');
}

async function doAddCustomer() {
    var body = { name: document.getElementById('cName').value, contact_name: document.getElementById('cContact').value, contact_phone: document.getElementById('cPhone').value, address: document.getElementById('cAddr').value, default_destination: document.getElementById('cDest').value };
    if (!body.name) { showToast('客户名称必填', 'error'); return; }
    var data = await api('/customers', { method: 'POST', body: JSON.stringify(body) });
    if (data && data.success) { showToast('添加成功'); closeModal(); loadCustomers(); }
    else showToast(data ? data.error : '添加失败', 'error');
}

function editCustomer(id, name, contact, phone, addr, dest) {
    var body = '<div class="form-group"><label>客户名称</label><input id="ecName" value="' + name + '"></div><div class="form-row"><div class="form-group"><label>联系人</label><input id="ecContact" value="' + contact + '"></div><div class="form-group"><label>联系电话</label><input id="ecPhone" value="' + phone + '"></div></div><div class="form-group"><label>地址</label><input id="ecAddr" value="' + addr + '"></div><div class="form-group"><label>默认目的地</label><input id="ecDest" value="' + dest + '"></div>';
    openModal('编辑客户', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doEditCustomer(' + id + ')">保存</button>');
}

async function doEditCustomer(id) {
    var body = { name: document.getElementById('ecName').value, contact_name: document.getElementById('ecContact').value, contact_phone: document.getElementById('ecPhone').value, address: document.getElementById('ecAddr').value, default_destination: document.getElementById('ecDest').value };
    var data = await api('/customers/' + id, { method: 'PUT', body: JSON.stringify(body) });
    if (data && data.success) { showToast('修改成功'); closeModal(); loadCustomers(); }
}

async function deleteCustomer(id) {
    if (!confirm('确认删除该客户？')) return;
    var data = await api('/customers/' + id, { method: 'DELETE' });
    if (data && data.success) { showToast('删除成功'); loadCustomers(); }
    else showToast(data ? data.error : '删除失败', 'error');
}

// ==================== 商户管理 ====================
async function loadMerchants() {
    var keyword = document.getElementById('merchantSearch').value;
    var status = document.getElementById('merchantStatusFilter').value;
    var data = await api('/merchants?keyword=' + encodeURIComponent(keyword) + '&status=' + status);
    if (!data) return;
    var tbody = document.getElementById('merchantsTable');
    if (!data.merchants || !data.merchants.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="9">暂无商户</td></tr>'; return; }
    tbody.innerHTML = data.merchants.map(function(m) {
        var contract = (m.contract_start || '?') + ' ~ ' + (m.contract_end || '?');
        return '<tr><td>' + m.id + '</td><td>' + m.name + '</td><td>' + (m.license_no||'-') + '</td><td>' + (m.contact_name||'-') + '</td><td>' + (m.contact_phone||'-') + '</td><td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;">' + (m.service_scope||'-') + '</td><td>' + contract + '</td><td>' + badgeCustom(m.status, m.status==='active'?'正常':'停用') + '</td><td><button class="btn btn-sm btn-outline" onclick="editMerchant(' + m.id + ')">编辑</button> <button class="btn btn-sm btn-danger" onclick="deleteMerchant(' + m.id + ')">删除</button></td></tr>';
    }).join('');
}

function showAddMerchantModal() {
    var body = '<div class="form-group"><label>商户名称 *</label><input id="mName"></div><div class="form-row"><div class="form-group"><label>营业执照号</label><input id="mLicense"></div><div class="form-group"><label>服务范围</label><input id="mScope"></div></div><div class="form-row"><div class="form-group"><label>联系人</label><input id="mContact"></div><div class="form-group"><label>联系电话</label><input id="mPhone"></div></div><div class="form-group"><label>地址</label><input id="mAddr"></div><div class="form-row"><div class="form-group"><label>合同开始</label><input id="mStart" type="date"></div><div class="form-group"><label>合同结束</label><input id="mEnd" type="date"></div></div>';
    openModal('添加商户', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-success" onclick="doAddMerchant()">添加</button>');
}

async function doAddMerchant() {
    var body = { name: document.getElementById('mName').value, license_no: document.getElementById('mLicense').value, contact_name: document.getElementById('mContact').value, contact_phone: document.getElementById('mPhone').value, address: document.getElementById('mAddr').value, service_scope: document.getElementById('mScope').value, contract_start: document.getElementById('mStart').value, contract_end: document.getElementById('mEnd').value };
    if (!body.name) { showToast('商户名称必填', 'error'); return; }
    var data = await api('/merchants', { method: 'POST', body: JSON.stringify(body) });
    if (data && data.success) { showToast('添加成功'); closeModal(); loadMerchants(); }
    else showToast(data ? data.error : '添加失败', 'error');
}

function editMerchant(id) {
    api('/merchants').then(function(data) {
        if (!data || !data.merchants) return;
        var m = data.merchants.find(function(x) { return x.id === id; });
        if (!m) return;
        var body = '<div class="form-group"><label>商户名称</label><input id="emName" value="' + esc(m.name) + '"></div><div class="form-row"><div class="form-group"><label>营业执照号</label><input id="emLicense" value="' + esc(m.license_no) + '"></div><div class="form-group"><label>服务范围</label><input id="emScope" value="' + esc(m.service_scope) + '"></div></div><div class="form-row"><div class="form-group"><label>联系人</label><input id="emContact" value="' + esc(m.contact_name) + '"></div><div class="form-group"><label>联系电话</label><input id="emPhone" value="' + esc(m.contact_phone) + '"></div></div><div class="form-group"><label>地址</label><input id="emAddr" value="' + esc(m.address) + '"></div><div class="form-row"><div class="form-group"><label>合同开始</label><input id="emStart" type="date" value="' + (m.contract_start||'') + '"></div><div class="form-group"><label>合同结束</label><input id="emEnd" type="date" value="' + (m.contract_end||'') + '"></div></div><div class="form-group"><label>状态</label><select id="emStatus" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"><option value="active"' + (m.status==='active'?' selected':'') + '>正常</option><option value="inactive"' + (m.status==='inactive'?' selected':'') + '>停用</option></select></div>';
        openModal('编辑商户', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doEditMerchant(' + id + ')">保存</button>');
    });
}

async function doEditMerchant(id) {
    var body = { name: document.getElementById('emName').value, license_no: document.getElementById('emLicense').value, contact_name: document.getElementById('emContact').value, contact_phone: document.getElementById('emPhone').value, address: document.getElementById('emAddr').value, service_scope: document.getElementById('emScope').value, contract_start: document.getElementById('emStart').value, contract_end: document.getElementById('emEnd').value, status: document.getElementById('emStatus').value };
    var data = await api('/merchants/' + id, { method: 'PUT', body: JSON.stringify(body) });
    if (data && data.success) { showToast('修改成功'); closeModal(); loadMerchants(); }
}

async function deleteMerchant(id) {
    if (!confirm('确认删除该商户？')) return;
    var data = await api('/merchants/' + id, { method: 'DELETE' });
    if (data && data.success) { showToast('删除成功'); loadMerchants(); }
}

function exportMerchants() { downloadCSV('/merchants/export'); }

// ==================== 财务报表 ====================
let finChart1 = null, finChart2 = null;

async function loadFinance() {
    var start = document.getElementById('financeStartDate').value;
    var end = document.getElementById('financeEndDate').value;
    var data = await api('/finance/report?start_date=' + (start||'') + '&end_date=' + (end||''));
    if (!data) return;
    document.getElementById('financeStats').innerHTML =
        '<div class="stat-card"><div class="label">总营收</div><div class="value green">' + fmtMoney(data.totalRevenue) + '</div></div>' +
        '<div class="stat-card"><div class="label">完成订单</div><div class="value blue">' + data.totalOrders + '</div></div>' +
        '<div class="stat-card"><div class="label">平均单价</div><div class="value blue">' + fmtMoney(data.avgPrice) + '</div></div>' +
        '<div class="stat-card"><div class="label">总订单（含取消）</div><div class="value orange">' + (data.totalAllOrders||0) + '</div></div>' +
        '<div class="stat-card"><div class="label">已取消</div><div class="value red">' + (data.cancelledOrders||0) + '</div></div>';
    var channelTbody = document.getElementById('channelTable');
    if (data.channelStats && data.channelStats.length) {
        channelTbody.innerHTML = data.channelStats.map(function(c) {
            return '<tr><td>' + (channelMap[c.channel]||c.channel||'未知') + '</td><td>' + c.count + '</td><td>' + fmtMoney(c.revenue) + '</td></tr>';
        }).join('');
    } else { channelTbody.innerHTML = '<tr class="empty-row"><td colspan="3">暂无数据</td></tr>'; }
    var stats = (data.dailyStats || []).slice().reverse();
    var labels = stats.map(function(s) { return s.date; });
    if (finChart1) finChart1.destroy();
    if (finChart2) finChart2.destroy();
    finChart1 = new Chart(document.getElementById('financeOrderChart'), {
        type: 'bar', data: { labels: labels, datasets: [
            { label: '总订单', data: stats.map(function(s){return s.orders;}), backgroundColor: '#818cf8' },
            { label: '已完成', data: stats.map(function(s){return s.completed;}), backgroundColor: '#34d399' }
        ]}, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
    finChart2 = new Chart(document.getElementById('financeRevenueChart'), {
        type: 'line', data: { labels: labels, datasets: [
            { label: '收入', data: stats.map(function(s){return s.revenue||0;}), borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,.1)', fill: true, tension: .3 }
        ]}, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
    });
}

function exportFinance() {
    var start = document.getElementById('financeStartDate').value;
    var end = document.getElementById('financeEndDate').value;
    downloadCSV('/finance/export?start_date=' + (start||'') + '&end_date=' + (end||''));
}

// ==================== 评价管理（含审核） ====================
async function loadRatings() {
    var filter = document.getElementById('ratingFilter').value;
    var auditFilter = document.getElementById('ratingAuditFilter').value;
    var url = '/ratings?limit=50';
    if (filter && filter !== '0') url += '&rating_filter=' + filter;
    if (auditFilter && auditFilter !== 'all') url += '&audit_status=' + auditFilter;
    var data = await api(url);
    if (!data) return;
    var tbody = document.getElementById('ratingsTable');
    if (!data.ratings || !data.ratings.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="8">暂无评价</td></tr>'; return; }
    var auditMap = { pending: '待审核', approved: '已通过', rejected: '已驳回' };
    tbody.innerHTML = data.ratings.map(function(r) {
        var auditBadge = r.audit_status ? badgeCustom(r.audit_status, auditMap[r.audit_status]||r.audit_status) : '<span style="color:var(--text3);">-</span>';
        var actions = '<button class="btn btn-sm btn-danger" onclick="deleteRating(' + r.id + ')">删除</button>';
        if (!r.audit_status || r.audit_status === 'pending') {
            actions = '<button class="btn btn-sm btn-success" onclick="auditRating(' + r.id + ',\'approve\')">通过</button> <button class="btn btn-sm btn-warning" onclick="auditRating(' + r.id + ',\'reject\')">驳回</button> ' + actions;
        }
        return '<tr><td>' + (r.order_no||'-') + '</td><td>' + (r.user_name||'匿名') + '</td><td>' + (r.driver_name||'未知') + '</td><td class="stars">' + stars(r.rating) + '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;" title="' + esc(r.comment) + '">' + (r.comment||'-') + '</td><td>' + auditBadge + '</td><td>' + fmtDate(r.created_at) + '</td><td>' + actions + '</td></tr>';
    }).join('');
}

async function auditRating(id, action) {
    var reason = action === 'reject' ? prompt('驳回原因：') : '';
    if (action === 'reject' && reason === null) return;
    var data = await api('/ratings/' + id + '/audit', { method: 'PUT', body: JSON.stringify({ action: action, reason: reason || '' }) });
    if (data && data.success) { showToast(data.message); loadRatings(); }
    else showToast(data ? data.error : '操作失败', 'error');
}

async function deleteRating(id) {
    if (!confirm('确认删除该评价？')) return;
    var data = await api('/ratings/' + id, { method: 'DELETE' });
    if (data && data.success) { showToast('已删除'); loadRatings(); }
}

function exportRatings() { downloadCSV('/ratings/export'); }

// ==================== 消息通知 ====================
async function loadNotifications() {
    var type = document.getElementById('notifTypeFilter').value;
    var target = document.getElementById('notifTargetFilter').value;
    var url = '/notifications?page=' + notifPage + '&limit=20';
    if (type && type !== 'all') url += '&type=' + type;
    if (target && target !== 'all') url += '&user_type=' + target;
    var data = await api(url);
    if (!data) return;
    var tbody = document.getElementById('notificationsTable');
    if (!data.notifications || !data.notifications.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="8">暂无通知</td></tr>'; return; }
    var typeMap = { system: '系统', order: '订单', sms_pending: '待发短信' };
    tbody.innerHTML = data.notifications.map(function(n) {
        var recv = n.driver_id ? '司机#' + n.driver_id : (n.user_id ? '用户#' + n.user_id : '全体');
        return '<tr><td>' + n.id + '</td><td>' + (typeMap[n.type]||n.type) + '</td><td>' + n.title + '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">' + n.content + '</td><td>' + recv + '</td><td>' + (n.is_read ? '已读' : '未读') + '</td><td>' + fmtDate(n.created_at) + '</td><td><button class="btn btn-sm btn-danger" onclick="deleteNotif(' + n.id + ')">删除</button></td></tr>';
    }).join('');
    // 分页
    var total = data.total || 0, pages = Math.ceil(total / 20), pgHtml = '';
    if (pages > 1) {
        pgHtml += '<button ' + (notifPage<=1?'disabled':'') + ' onclick="notifPage--;loadNotifications()">上一页</button>';
        pgHtml += '<span style="font-size:12px;color:var(--text2);margin:0 8px;">共 ' + total + ' 条</span>';
        pgHtml += '<button ' + (notifPage>=pages?'disabled':'') + ' onclick="notifPage++;loadNotifications()">下一页</button>';
    }
    document.getElementById('notifPagination').innerHTML = pgHtml;
}

async function deleteNotif(id) {
    if (!confirm('确认删除该通知？')) return;
    var data = await api('/notifications/' + id, { method: 'DELETE' });
    if (data && data.success) { showToast('已删除'); loadNotifications(); }
}

function showSendNotifModal() {
    var body = '<div class="form-group"><label>接收对象</label><select id="snTarget" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"><option value="user">指定用户</option><option value="driver">指定司机</option></select></div>' +
        '<div class="form-row"><div class="form-group"><label>用户ID</label><input id="snUserId" type="number" placeholder="留空则全体用户"></div><div class="form-group"><label>司机ID</label><input id="snDriverId" type="number" placeholder="留空则全体司机"></div></div>' +
        '<div class="form-group"><label>类型</label><select id="snType" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"><option value="system">系统通知</option><option value="order">订单通知</option></select></div>' +
        '<div class="form-group"><label>标题 *</label><input id="snTitle"></div>' +
        '<div class="form-group"><label>内容 *</label><textarea id="snContent" rows="3" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"></textarea></div>';
    openModal('发送通知', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-success" onclick="doSendNotif()">发送</button>');
}

async function doSendNotif() {
    var body = { user_id: document.getElementById('snUserId').value || null, driver_id: document.getElementById('snDriverId').value || null, type: document.getElementById('snType').value, title: document.getElementById('snTitle').value, content: document.getElementById('snContent').value };
    if (!body.title || !body.content) { showToast('标题和内容必填', 'error'); return; }
    var data = await api('/notifications', { method: 'POST', body: JSON.stringify(body) });
    if (data && data.success) { showToast('发送成功'); closeModal(); loadNotifications(); }
    else showToast(data ? data.error : '发送失败', 'error');
}

function showBroadcastModal() {
    var body = '<div class="form-group"><label>群发对象</label><select id="bcTarget" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"><option value="all">全部用户+司机</option><option value="all_users">全部用户</option><option value="all_drivers">全部司机</option></select></div>' +
        '<div class="form-group"><label>类型</label><select id="bcType" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"><option value="system">系统通知</option><option value="order">订单通知</option></select></div>' +
        '<div class="form-group"><label>标题 *</label><input id="bcTitle"></div>' +
        '<div class="form-group"><label>内容 *</label><textarea id="bcContent" rows="3" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"></textarea></div>';
    openModal('群发通知', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doBroadcast()">群发</button>');
}

async function doBroadcast() {
    var body = { target: document.getElementById('bcTarget').value, type: document.getElementById('bcType').value, title: document.getElementById('bcTitle').value, content: document.getElementById('bcContent').value };
    if (!body.title || !body.content) { showToast('标题和内容必填', 'error'); return; }
    var data = await api('/notifications/broadcast', { method: 'POST', body: JSON.stringify(body) });
    if (data && data.success) { showToast(data.message); closeModal(); loadNotifications(); }
    else showToast(data ? data.error : '群发失败', 'error');
}

// ==================== 配置中心 ====================
async function loadConfig() {
    // 系统配置
    var data = await api('/config');
    var tbody = document.getElementById('configTable');
    if (data && data.configs && data.configs.length) {
        tbody.innerHTML = data.configs.filter(function(c) { return !c.config_key.startsWith('role_') && !c.config_key.startsWith('dict_'); }).map(function(c) {
            var val = c.config_value.length > 80 ? c.config_value.slice(0, 80) + '...' : c.config_value;
            return '<tr><td style="font-family:monospace;font-size:12px;">' + c.config_key + '</td><td style="font-size:12px;">' + esc(val) + '</td><td style="font-size:12px;">' + fmtDate(c.updated_at) + '</td><td><button class="btn btn-sm btn-outline" onclick="editConfig(\'' + esc(c.config_key) + '\',\'' + esc(c.config_value) + '\')">编辑</button></td></tr>';
        }).join('');
    } else { tbody.innerHTML = '<tr class="empty-row"><td colspan="4">暂无配置</td></tr>'; }

    // 拍照模板
    var tplData = await api('/config/templates');
    var tTbody = document.getElementById('templateTable');
    if (tplData && tplData.templates && tplData.templates.length) {
        var tplTypeMap = { site: '现场救援', departure: '出发前接单', sms: '短信模板' };
        tTbody.innerHTML = tplData.templates.map(function(t) {
            return '<tr><td>' + (tplTypeMap[t.type]||t.type) + '</td><td>' + t.name + '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">' + (t.content||'-') + '</td><td>' + (t.is_active ? '✅' : '❌') + '</td><td><button class="btn btn-sm btn-outline" onclick="editTemplate(' + t.id + ',\'' + t.type + '\',\'' + esc(t.name) + '\',\'' + esc(t.content) + '\',' + t.is_active + ')">编辑</button> <button class="btn btn-sm btn-danger" onclick="deleteTemplate(' + t.id + ')">删除</button></td></tr>';
        }).join('');
    } else { tTbody.innerHTML = '<tr class="empty-row"><td colspan="5">暂无模板</td></tr>'; }

    // 字典
    loadDict();
}

async function loadDict() {
    var data = await api('/dict');
    var tbody = document.getElementById('dictTable');
    if (data && data.dicts && data.dicts.length) {
        tbody.innerHTML = data.dicts.map(function(d) {
            var items = d.value.items ? d.value.items.map(function(i) { return i.label; }).join(', ') : '-';
            return '<tr><td>' + d.value.name + '</td><td style="font-size:12px;">' + items + '</td><td><button class="btn btn-sm btn-danger" onclick="deleteDict(\'' + esc(d.key) + '\')">删除</button></td></tr>';
        }).join('');
    } else { tbody.innerHTML = '<tr class="empty-row"><td colspan="3">暂无字典</td></tr>'; }
}

function showAddConfigModal() {
    var body = '<div class="form-group"><label>配置键 *</label><input id="ncKey" placeholder="如: sms_gateway"></div><div class="form-group"><label>配置值</label><textarea id="ncValue" rows="3" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"></textarea></div>';
    openModal('添加配置', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-success" onclick="doAddConfig()">保存</button>');
}

async function doAddConfig() {
    var body = { config_key: document.getElementById('ncKey').value, config_value: document.getElementById('ncValue').value };
    if (!body.config_key) { showToast('配置键必填', 'error'); return; }
    var data = await api('/config', { method: 'POST', body: JSON.stringify(body) });
    if (data && data.success) { showToast('保存成功'); closeModal(); loadConfig(); }
}

function editConfig(key, value) {
    var body = '<div class="form-group"><label>配置键</label><input value="' + key + '" disabled style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg3);"></div><div class="form-group"><label>配置值</label><textarea id="ecValue" rows="5" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;">' + value + '</textarea></div>';
    openModal('编辑配置 - ' + key, body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doEditConfig(\'' + key + '\')">保存</button>');
}

async function doEditConfig(key) {
    var data = await api('/config/' + key, { method: 'PUT', body: JSON.stringify({ config_value: document.getElementById('ecValue').value }) });
    if (data && data.success) { showToast('更新成功'); closeModal(); loadConfig(); }
}

function showAddTemplateModal() {
    var body = '<div class="form-row"><div class="form-group"><label>类型 *</label><select id="ntType" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"><option value="site">现场救援</option><option value="departure">出发前接单</option><option value="sms">短信模板</option></select></div><div class="form-group"><label>名称 *</label><input id="ntName"></div></div><div class="form-group"><label>内容</label><textarea id="ntContent" rows="3" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"></textarea></div><div class="form-group"><label><input type="checkbox" id="ntActive" checked> 启用</label></div>';
    openModal('添加模板', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-success" onclick="doAddTemplate()">添加</button>');
}

async function doAddTemplate() {
    var body = { type: document.getElementById('ntType').value, name: document.getElementById('ntName').value, content: document.getElementById('ntContent').value, is_active: document.getElementById('ntActive').checked ? 1 : 0 };
    if (!body.type || !body.name) { showToast('类型和名称必填', 'error'); return; }
    var data = await api('/config/templates', { method: 'POST', body: JSON.stringify(body) });
    if (data && data.success) { showToast('添加成功'); closeModal(); loadConfig(); }
}

function editTemplate(id, type, name, content, isActive) {
    var body = '<div class="form-row"><div class="form-group"><label>类型</label><select id="etType" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"><option value="site"' + (type==='site'?' selected':'') + '>现场救援</option><option value="departure"' + (type==='departure'?' selected':'') + '>出发前接单</option><option value="sms"' + (type==='sms'?' selected':'') + '>短信模板</option></select></div><div class="form-group"><label>名称</label><input id="etName" value="' + name + '"></div></div><div class="form-group"><label>内容</label><textarea id="etContent" rows="3" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;">' + content + '</textarea></div><div class="form-group"><label><input type="checkbox" id="etActive"' + (isActive?' checked':'') + '> 启用</label></div>';
    openModal('编辑模板', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doEditTemplate(' + id + ')">保存</button>');
}

async function doEditTemplate(id) {
    var body = { type: document.getElementById('etType').value, name: document.getElementById('etName').value, content: document.getElementById('etContent').value, is_active: document.getElementById('etActive').checked ? 1 : 0 };
    var data = await api('/config/templates/' + id, { method: 'PUT', body: JSON.stringify(body) });
    if (data && data.success) { showToast('更新成功'); closeModal(); loadConfig(); }
}

async function deleteTemplate(id) {
    if (!confirm('确认删除该模板？')) return;
    var data = await api('/config/templates/' + id, { method: 'DELETE' });
    if (data && data.success) { showToast('已删除'); loadConfig(); }
}

function showAddDictModal() {
    var body = '<div class="form-group"><label>字典名称 *</label><input id="ndName" placeholder="如: 救援类型"></div><div class="form-group"><label>选项（每行一个，格式：标签=值）</label><textarea id="ndItems" rows="5" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;" placeholder="事故拖车=accident&#10;故障救援=breakdown&#10;违法拖车=violation"></textarea></div>';
    openModal('添加字典', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-success" onclick="doAddDict()">添加</button>');
}

async function doAddDict() {
    var name = document.getElementById('ndName').value;
    var itemsText = document.getElementById('ndItems').value.trim();
    if (!name) { showToast('字典名称必填', 'error'); return; }
    var items = itemsText ? itemsText.split('\n').filter(function(l){return l.trim();}).map(function(l) {
        var parts = l.split('=');
        return { label: parts[0].trim(), value: (parts[1] || parts[0]).trim() };
    }) : [];
    var data = await api('/dict', { method: 'POST', body: JSON.stringify({ name: name, items: items }) });
    if (data && data.success) { showToast('添加成功'); closeModal(); loadConfig(); }
}

async function deleteDict(key) {
    if (!confirm('确认删除该字典？')) return;
    var data = await api('/config/' + key, { method: 'DELETE' });
    if (data && data.success) { showToast('已删除'); loadConfig(); }
    else { showToast('删除失败', 'error'); }
}

// ==================== 角色权限 ====================
async function loadRoles() {
    var data = await api('/roles');
    var tbody = document.getElementById('rolesTable');
    if (data && data.roles && data.roles.length) {
        tbody.innerHTML = data.roles.map(function(r) {
            var info = JSON.parse(r.config_value);
            var perms = info.permissions && info.permissions.length ? info.permissions.map(function(p){ return '<span style="background:var(--bg3);padding:2px 8px;border-radius:4px;font-size:11px;margin:2px;">' + p + '</span>'; }).join('') : '<span style="color:var(--text3);">无权限</span>';
            return '<tr><td>' + info.name + '</td><td>' + perms + '</td><td><button class="btn btn-sm btn-danger" onclick="deleteRole(\'' + esc(r.config_key.replace('role_','')) + '\')">删除</button></td></tr>';
        }).join('');
    } else { tbody.innerHTML = '<tr class="empty-row"><td colspan="3">暂无角色（默认admin拥有全部权限）</td></tr>'; }
}

function showAddRoleModal() {
    var allPerms = ['orders:view','orders:dispatch','orders:settle','orders:intervene','drivers:manage','vehicles:manage','ratings:audit','finance:view','notifications:send','config:manage','approvals:manage','merchants:manage','system:admin'];
    var body = '<div class="form-group"><label>角色名 *</label><input id="nrName"></div><div class="form-group"><label>权限</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">' +
        allPerms.map(function(p){ return '<label style="font-size:13px;"><input type="checkbox" class="nrPerm" value="' + p + '"> ' + p + '</label>'; }).join('') +
        '</div></div><div style="margin-top:8px;"><button class="btn btn-sm btn-outline" onclick="document.querySelectorAll(\'.nrPerm\').forEach(function(c){c.checked=true;})">全选</button> <button class="btn btn-sm btn-outline" onclick="document.querySelectorAll(\'.nrPerm\').forEach(function(c){c.checked=false;})">清空</button></div>';
    openModal('添加角色', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-success" onclick="doAddRole()">添加</button>');
}

async function doAddRole() {
    var name = document.getElementById('nrName').value;
    if (!name) { showToast('角色名必填', 'error'); return; }
    var perms = [];
    document.querySelectorAll('.nrPerm:checked').forEach(function(c) { perms.push(c.value); });
    var data = await api('/roles', { method: 'POST', body: JSON.stringify({ name: name, permissions: perms }) });
    if (data && data.success) { showToast('角色已创建'); closeModal(); loadRoles(); }
    else showToast(data ? data.error : '创建失败', 'error');
}

async function deleteRole(key) {
    if (!confirm('确认删除该角色？')) return;
    var data = await api('/roles/' + key, { method: 'DELETE' });
    if (data && data.success) { showToast('已删除'); loadRoles(); }
}

// ==================== 日志审计 ====================
async function loadAuditLog() {
    var data = await api('/audit-log?page=' + auditPage + '&limit=30');
    if (!data) return;
    var tbody = document.getElementById('auditLogTable');
    if (!data.logs || !data.logs.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="4">暂无日志</td></tr>'; document.getElementById('auditPagination').innerHTML=''; return; }
    tbody.innerHTML = data.logs.map(function(l) {
        return '<tr><td style="font-size:12px;">' + fmtDate(l.created_at) + '</td><td>' + (l.order_no||'-') + '</td><td>' + badgeCustom(l.status, l.status) + '</td><td style="font-size:12px;">' + l.description + '</td></tr>';
    }).join('');
    var total = data.total || 0, pages = Math.ceil(total / 30), pgHtml = '';
    if (pages > 1) {
        pgHtml += '<button ' + (auditPage<=1?'disabled':'') + ' onclick="auditPage--;loadAuditLog()">上一页</button>';
        pgHtml += '<span style="font-size:12px;color:var(--text2);margin:0 8px;">共 ' + total + ' 条</span>';
        pgHtml += '<button ' + (auditPage>=pages?'disabled':'') + ' onclick="auditPage++;loadAuditLog()">下一页</button>';
    }
    document.getElementById('auditPagination').innerHTML = pgHtml;
}

// ==================== 短信网关 ====================
async function loadSms() {
    var data = await api('/sms/gateway');
    var statusDiv = document.getElementById('smsGatewayStatus');
    if (data && data.gateway) {
        statusDiv.innerHTML = '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;">✅ 短信网关已配置 | 服务商：' + data.gateway.provider + ' | API Key：' + data.gateway.api_key + (data.gateway.sign_name ? ' | 签名：' + data.gateway.sign_name : '') + '</div>';
        // 填充表单
        if (data.gateway.provider) document.getElementById('smsProvider').value = data.gateway.provider;
        if (data.gateway.api_key) document.getElementById('smsApiKey').placeholder = data.gateway.api_key + '****';
    } else {
        statusDiv.innerHTML = '<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px;">⚠️ 短信网关未配置，短信功能不可用</div>';
    }
    // 短信模板
    var tplData = await api('/config/sms-templates');
    var tbody = document.getElementById('smsTemplateTable');
    if (tplData && tplData.templates && tplData.templates.length) {
        tbody.innerHTML = tplData.templates.map(function(t) {
            return '<tr><td>' + t.name + '</td><td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;font-size:12px;">' + (t.content||'-') + '</td><td>' + (t.is_active ? '✅' : '❌') + '</td><td><button class="btn btn-sm btn-outline" onclick="editTemplate(' + t.id + ',\'sms\',\'' + esc(t.name) + '\',\'' + esc(t.content) + '\',' + t.is_active + ')">编辑</button> <button class="btn btn-sm btn-danger" onclick="deleteTemplate(' + t.id + ')">删除</button></td></tr>';
        }).join('');
    } else { tbody.innerHTML = '<tr class="empty-row"><td colspan="4">暂无短信模板，请在配置中心添加类型为"短信模板"的模板</td></tr>'; }
}

async function saveSmsGateway() {
    var body = { provider: document.getElementById('smsProvider').value, api_key: document.getElementById('smsApiKey').value, api_secret: document.getElementById('smsApiSecret').value, sign_name: document.getElementById('smsSignName').value };
    if (!body.api_key) { showToast('API Key 必填', 'error'); return; }
    var data = await api('/sms/gateway', { method: 'POST', body: JSON.stringify(body) });
    if (data && data.success) { showToast('配置已保存'); loadSms(); }
    else showToast(data ? data.error : '保存失败', 'error');
}

async function testSmsSend() {
    var phone = document.getElementById('smsTestPhone').value;
    var template = document.getElementById('smsTestTemplate').value;
    if (!phone) { showToast('请输入手机号', 'error'); return; }
    var data = await api('/sms/send', { method: 'POST', body: JSON.stringify({ phone: phone, template_code: template || 'TEST' }) });
    if (data && data.success) { showToast(data.message + (data.simulated ? '（模拟模式）' : '')); }
    else showToast(data ? data.error : '发送失败', 'error');
}

function showAddSmsTemplateModal() {
    var body = '<div class="form-group"><label>模板名称 *</label><input id="sntName" placeholder="如：验证码模板"></div><div class="form-group"><label>模板内容</label><textarea id="sntContent" rows="3" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;" placeholder="您的验证码为 ${code}，有效期 ${expire} 分钟"></textarea></div>';
    openModal('添加短信模板', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-success" onclick="doAddSmsTemplate()">添加</button>');
}

async function doAddSmsTemplate() {
    var body = { type: 'sms', name: document.getElementById('sntName').value, content: document.getElementById('sntContent').value, is_active: 1 };
    if (!body.name) { showToast('模板名称必填', 'error'); return; }
    var data = await api('/config/templates', { method: 'POST', body: JSON.stringify(body) });
    if (data && data.success) { showToast('添加成功'); closeModal(); loadSms(); }
}