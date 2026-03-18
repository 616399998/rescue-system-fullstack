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
        `CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_no TEXT UNIQUE NOT NULL,
          user_id INTEGER NOT NULL DEFAULT 1,
          service_type TEXT NOT NULL,
          vehicle_type TEXT DEFAULT 'sedan',
          vehicle_plate TEXT DEFAULT '京 A·88888',
          vehicle_brand TEXT DEFAULT '大众',
          vehicle_color TEXT DEFAULT '白色',
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
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS order_timeline (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          status TEXT NOT NULL,
          description TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS recharge_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          amount REAL NOT NULL,
          bonus REAL DEFAULT 0,
          status TEXT DEFAULT 'completed',
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
