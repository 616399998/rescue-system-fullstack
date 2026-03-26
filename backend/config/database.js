const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'rescue.db');

// 数据库实例（异步）
let db = null;

// 初始化数据库
function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('数据库连接失败:', err);
        reject(err);
        return;
      }
      console.log('已连接到 SQLite 数据库');
      
      // 创建表
      const tables = [
        // 用户表
        `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          phone TEXT,
          avatar TEXT,
          balance REAL DEFAULT 1286.00,
          points INTEGER DEFAULT 3200,
          level TEXT DEFAULT 'VIP 会员',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // 订单表（扩展）
        `CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_no TEXT UNIQUE NOT NULL,
          user_id INTEGER NOT NULL DEFAULT 1,
          service_type TEXT NOT NULL,
          vehicle_type TEXT DEFAULT 'sedan',
          vehicle_plate TEXT,
          vehicle_brand TEXT,
          vehicle_color TEXT,
          current_location TEXT NOT NULL,
          destination TEXT,
          address TEXT,
          problem_description TEXT,
          status TEXT DEFAULT 'processing',
          price REAL,
          driver_id INTEGER,
          driver_name TEXT,
          driver_phone TEXT,
          driver_rating REAL,
          rescue_vehicle_plate TEXT,
          rescue_vehicle_model TEXT,
          progress INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          owner_name TEXT,
          owner_phone TEXT,
          movable TEXT DEFAULT 'yes',
          special_note TEXT,
          photos TEXT,
          priority TEXT DEFAULT 'normal',
          insurance_no TEXT,
          insurance_company TEXT,
          tow_fee REAL,
          mileage_fee REAL,
          extra_fee REAL,
          total_fee REAL,
          rated INTEGER DEFAULT 0,
          rating INTEGER,
          comment TEXT,
          settled INTEGER DEFAULT 0,
          channel TEXT DEFAULT 'personal',
          violation_type TEXT,
          found_time DATETIME,
          found_location TEXT,
          found_address TEXT,
          is_garage INTEGER DEFAULT 0,
          sign_photo TEXT,
          sign_user TEXT,
          navigation_started INTEGER DEFAULT 0,
          arrived_at_site DATETIME,
          arrived_at_dest DATETIME,
          rejected_reason TEXT
        )`,
        // 订单时间线
        `CREATE TABLE IF NOT EXISTS order_timeline (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          status TEXT NOT NULL,
          description TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // 充值记录
        `CREATE TABLE IF NOT EXISTS recharge_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          amount REAL NOT NULL,
          bonus REAL DEFAULT 0,
          status TEXT DEFAULT 'completed',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // 派单日志
        `CREATE TABLE IF NOT EXISTS dispatch_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          driver_id INTEGER NOT NULL,
          admin_user TEXT DEFAULT 'admin',
          dispatched_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // 司机表（新增）
        `CREATE TABLE IF NOT EXISTS drivers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          phone TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          license_no TEXT,
          license_expiry DATE,
          qualification_no TEXT,
          qualification_expiry DATE,
          vehicle_id INTEGER,
          status TEXT DEFAULT 'active',
          rating REAL DEFAULT 5.0,
          total_orders INTEGER DEFAULT 0,
          latitude REAL,
          longitude REAL,
          last_location_update DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // 车辆表（新增）
        `CREATE TABLE IF NOT EXISTS vehicles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plate_no TEXT UNIQUE NOT NULL,
          model TEXT,
          type TEXT DEFAULT 'tow',
          device_no TEXT,
          insurance_no TEXT,
          insurance_expiry DATE,
          inspection_expiry DATE,
          mileage INTEGER DEFAULT 0,
          status TEXT DEFAULT 'active',
          driver_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // 车辆位置记录（新增）
        `CREATE TABLE IF NOT EXISTS vehicle_locations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vehicle_id INTEGER NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          speed REAL,
          direction REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // 机构客户表（新增）
        `CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          contact_name TEXT,
          contact_phone TEXT,
          address TEXT,
          default_destination TEXT,
          pricing_formula TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // 商户表（新增）
        `CREATE TABLE IF NOT EXISTS merchants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          license_no TEXT,
          contact_name TEXT,
          contact_phone TEXT,
          address TEXT,
          service_scope TEXT,
          contract_start DATE,
          contract_end DATE,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // 通知消息表（新增）
        `CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          driver_id INTEGER,
          type TEXT,
          title TEXT,
          content TEXT NOT NULL,
          is_read INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // 维修保养记录表（新增）
        `CREATE TABLE IF NOT EXISTS vehicle_maintenance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vehicle_id INTEGER NOT NULL,
          type TEXT,
          description TEXT,
          cost REAL,
          applicant_id INTEGER,
          status TEXT DEFAULT 'pending',
          approved_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // 配置模板表（新增）
        `CREATE TABLE IF NOT EXISTS config_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          content TEXT,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      ];

      let completed = 0;
      tables.forEach((sql, index) => {
        db.run(sql, (err) => {
          if (err) console.error('创建表失败:', index, err);
          completed++;
          if (completed === tables.length) {
            console.log('数据库表初始化完成');
            
            // 插入默认用户
            db.run(`INSERT OR IGNORE INTO users (id, username, password, balance, points, level) 
                    VALUES (1, 'user8829', 'hashed_pwd', 1286.00, 3200, 'VIP 会员')`, (err) => {
              if (err) console.error('插入默认用户失败:', err);
              resolve();
            });
          }
        });
      });
    });
  });
}

// 包装 run 方法为 Promise
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
    });
  });
}

// 包装 get 方法为 Promise
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// 包装 all 方法为 Promise
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = { 
  getDb: () => db,
  initDatabase,
  run,
  get,
  all
};
