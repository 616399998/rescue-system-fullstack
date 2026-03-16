const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'rescue.db');
const db = new Database(dbPath);

// 初始化数据库表
function initDatabase() {
  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone TEXT,
      avatar TEXT,
      balance REAL DEFAULT 1286.00,
      points INTEGER DEFAULT 3200,
      level TEXT DEFAULT 'VIP 会员',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 车辆表
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plate_number TEXT NOT NULL,
      brand TEXT,
      color TEXT,
      vehicle_type TEXT,
      is_default INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 订单表
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      service_type TEXT NOT NULL,
      vehicle_type TEXT,
      vehicle_plate TEXT,
      vehicle_brand TEXT,
      vehicle_color TEXT,
      current_location TEXT,
      destination TEXT,
      address TEXT,
      problem_description TEXT,
      status TEXT DEFAULT 'pending',
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
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (driver_id) REFERENCES users(id)
    )
  `);

  // 订单进度表
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  // 充值记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS recharge_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      bonus REAL DEFAULT 0,
      status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 司机表
  db.exec(`
    CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      total_orders INTEGER DEFAULT 0,
      rating REAL DEFAULT 5.0,
      vehicle_plate TEXT,
      vehicle_model TEXT,
      status TEXT DEFAULT 'available',
      current_lat REAL,
      current_lng REAL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  console.log('数据库初始化完成');
}

module.exports = { db, initDatabase };
