// ==================== 全局配置 ====================
const API = window.location.origin + '/api/admin';
let token = localStorage.getItem('admin_token') || '';
let currentPage = 'dashboard';
let orderPage = 1;
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

// 自动检查登录
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
const pageTitles = { dashboard:'仪表盘', orders:'订单管理', drivers:'司机管理', vehicles:'车辆管理', users:'用户管理', customers:'机构客户', finance:'财务报表', ratings:'评价管理' };

function switchPage(page) {
    currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('.nav-item[data-page="' + page + '"]').classList.add('active');
    document.getElementById('pageTitle').textContent = pageTitles[page] || page;
    if (page === 'dashboard') loadDashboard();
    else if (page === 'orders') { orderPage = 1; loadOrders(); }
    else if (page === 'drivers') loadDrivers();
    else if (page === 'vehicles') loadVehicles();
    else if (page === 'users') loadUsers();
    else if (page === 'customers') loadCustomers();
    else if (page === 'finance') loadFinance();
    else if (page === 'ratings') loadRatings();
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
        return '<tr><td>' + o.order_no + '</td><td>' + (channelMap[o.channel]||'个人端') + '</td><td>' + badge(o.status) + '</td><td>' + (serviceMap[o.service_type]||o.service_type) + '</td><td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;" title="' + o.current_location + '">' + o.current_location + '</td><td>' + (o.vehicle_plate||'-') + '</td><td>' + (o.owner_name||'-') + '</td><td>' + fmtMoney(o.price) + '</td><td>' + (o.driver ? o.driver.name : '-') + '</td><td>' + fmtDate(o.created_at) + '</td><td><button class="btn btn-sm btn-outline" onclick="viewOrder(' + o.id + ')">详情</button>' + (o.status==='pending' ? ' <button class="btn btn-sm btn-primary" onclick="dispatchOrder(' + o.id + ')">派单</button>' : '') + (o.status==='processing' ? ' <button class="btn btn-sm btn-success" onclick="completeOrder(' + o.id + ')">完成</button>' : '') + '</td></tr>';
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

async function viewOrder(id) {
    var data = await api('/orders/' + id);
    if (!data || !data.order) return;
    var o = data.order;
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
        '</div>' +
        (o.driver ? '<div style="background:#f8fafc;border-radius:8px;padding:12px;margin:12px 0;"><strong>司机：</strong>' + o.driver.name + ' | ' + o.driver.phone + ' | ' + (o.driver.vehicle_plate||'-') + '</div>' : '') +
        (o.timeline && o.timeline.length ? '<div class="timeline">' + o.timeline.map(function(t){ return '<div class="timeline-item"><div class="timeline-time">' + t.time + '</div><div class="timeline-content">' + t.content + '</div></div>'; }).join('') + '</div>' : '');
    openModal('订单详情 - ' + o.order_no, body, '<button class="btn btn-outline" onclick="closeModal()">关闭</button>');
}

async function dispatchOrder(orderId) {
    var data = await api('/dispatch/available-drivers');
    if (!data || !data.drivers || !data.drivers.length) { showToast('暂无可派司机', 'error'); return; }
    var opts = data.drivers.map(function(d){ return '<option value="' + d.id + '" data-name="' + d.name + '" data-phone="' + d.phone + '" data-rating="' + d.rating + '">' + d.name + ' | ⭐' + d.rating + ' | ' + d.status + '</option>'; }).join('');
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
        return '<tr><td>' + d.id + '</td><td>' + d.name + '</td><td>' + d.phone + '</td><td>' + (d.license_no||'-') + '</td><td>' + (d.qualification_no||'-') + '</td><td>⭐' + d.rating + '</td><td>' + d.total_orders + '</td><td>' + badgeCustom(d.status, d.status_text) + '</td><td>' + (d.status==='active' ? '<button class="btn btn-sm btn-warning" onclick="toggleDriver(' + d.id + ',\'offline\')">下线</button>' : '<button class="btn btn-sm btn-success" onclick="toggleDriver(' + d.id + ',\'active\')">激活</button>') + ' <button class="btn btn-sm btn-outline" onclick="editDriver(' + d.id + ',\'' + d.name + '\',\'' + d.phone + '\',\'' + (d.license_no||'') + '\',\'' + (d.qualification_no||'') + '\')">编辑</button></td></tr>';
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
    // Fetch vehicle details first
    api('/vehicles').then(function(data) {
        if (!data || !data.vehicles) return;
        var v = data.vehicles.find(function(x) { return x.id === id; });
        if (!v) return;
        var body = '<div class="form-row"><div class="form-group"><label>车牌号</label><input id="evPlate" value="' + v.plate_no + '"></div><div class="form-group"><label>型号</label><input id="evModel" value="' + (v.model||'') + '"></div></div><div class="form-row"><div class="form-group"><label>类型</label><select id="evType" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"><option value="tow"' + (v.type==='tow'?' selected':'') + '>拖车</option><option value="flatbed"' + (v.type==='flatbed'?' selected':'') + '>平板车</option><option value="crane"' + (v.type==='crane'?' selected':'') + '>吊车</option></select></div><div class="form-group"><label>设备号</label><input id="evDevice" value="' + (v.device_no||'') + '"></div></div><div class="form-row"><div class="form-group"><label>保险单号</label><input id="evInsurance" value="' + (v.insurance_no||'') + '"></div><div class="form-group"><label>状态</label><select id="evStatus" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;"><option value="active"' + (v.status==='active'?' selected':'') + '>正常</option><option value="maintenance"' + (v.status==='maintenance'?' selected':'') + '>维修中</option><option value="retired"' + (v.status==='retired'?' selected':'') + '>已报废</option></select></div></div>';
        openModal('编辑车辆', body, '<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doEditVehicle(' + id + ')">保存</button>');
    });
}

async function doEditVehicle(id) {
    var body = { plate_no: document.getElementById('evPlate').value, model: document.getElementById('evModel').value, type: document.getElementById('evType').value, device_no: document.getElementById('evDevice').value, insurance_no: document.getElementById('evInsurance').value, status: document.getElementById('evStatus').value };
    var data = await api('/vehicles/' + id, { method: 'PUT', body: JSON.stringify(body) });
    if (data && data.success) { showToast('修改成功'); closeModal(); loadVehicles(); }
}

function exportVehicles() { downloadCSV('/vehicles/export'); }

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
        return '<tr><td>' + c.id + '</td><td>' + c.name + '</td><td>' + (c.contact_name||'-') + '</td><td>' + (c.contact_phone||'-') + '</td><td>' + (c.address||'-') + '</td><td>' + (c.default_destination||'-') + '</td><td>' + c.order_count + '</td><td><button class="btn btn-sm btn-outline" onclick="editCustomer(' + c.id + ',\'' + c.name + '\',\'' + (c.contact_name||'') + '\',\'' + (c.contact_phone||'') + '\',\'' + (c.address||'') + '\',\'' + (c.default_destination||'') + '\')">编辑</button> <button class="btn btn-sm btn-danger" onclick="deleteCustomer(' + c.id + ')">删除</button></td></tr>';
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

    // 渠道统计表
    var channelTbody = document.getElementById('channelTable');
    if (data.channelStats && data.channelStats.length) {
        channelTbody.innerHTML = data.channelStats.map(function(c) {
            return '<tr><td>' + (channelMap[c.channel]||c.channel||'未知') + '</td><td>' + c.count + '</td><td>' + fmtMoney(c.revenue) + '</td></tr>';
        }).join('');
    } else { channelTbody.innerHTML = '<tr class="empty-row"><td colspan="3">暂无数据</td></tr>'; }

    // 图表
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

// ==================== 评价管理 ====================
async function loadRatings() {
    var filter = document.getElementById('ratingFilter').value;
    var url = '/ratings?limit=50';
    if (filter && filter !== '0') url += '&rating_filter=' + filter;
    var data = await api(url);
    if (!data) return;
    var tbody = document.getElementById('ratingsTable');
    if (!data.ratings || !data.ratings.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="7">暂无评价</td></tr>'; return; }
    tbody.innerHTML = data.ratings.map(function(r) {
        return '<tr><td>' + (r.order_no||'-') + '</td><td>' + (r.user_name||'匿名') + '</td><td>' + (r.driver_name||'未知') + '</td><td class="stars">' + stars(r.rating) + '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;" title="' + (r.comment||'') + '">' + (r.comment||'-') + '</td><td>' + fmtDate(r.created_at) + '</td><td><button class="btn btn-sm btn-danger" onclick="deleteRating(' + r.id + ')">删除</button></td></tr>';
    }).join('');
}

async function deleteRating(id) {
    if (!confirm('确认删除该评价？')) return;
    var data = await api('/ratings/' + id, { method: 'DELETE' });
    if (data && data.success) { showToast('已删除'); loadRatings(); }
    else showToast(data ? data.error : '删除失败', 'error');
}

function exportRatings() { downloadCSV('/ratings/export'); }