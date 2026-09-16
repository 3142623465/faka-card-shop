/**
 * db.js - 数据库适配层（双模式）
 * - 云部署（MONGODB_URI 存在）：内存运行 + MongoDB 全量持久化，重启不丢失
 * - 本地开发（无 MONGODB_URI）：JSON 文件持久化（data/db.json）
 * 路由代码无需任何改动，统一通过 load()/save()/mutate()/nextId() 操作。
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const TMP_FILE = DB_FILE + '.tmp';

const MONGODB_URI = process.env.MONGODB_URI || '';
const USE_MONGO = !!MONGODB_URI;

let db = null;
let dirty = false;
let saveTimer = null;
let mongoCol = null;
let mongoReady = false;

/* ================= 公共数据结构 ================= */

function emptyDb() {
  return {
    seq: {}, settings: null, users: [], smsCodes: [], resetTokens: [], sessions: [],
    categories: [], products: [], cards: [], orders: [], aftersales: [], cart: [],
    addresses: [], favorites: [], banners: [], coupons: [], userCoupons: [],
    messages: [], faqs: [], tickets: [], chat: [], pointsLogs: [], uploads: [],
    branches: [], branchBalanceLogs: [], withdrawals: [], platformLogs: [], balanceLogs: []
  };
}

/* ================= MongoDB 模式 ================= */

async function connectMongo() {
  if (mongoReady) return;
  const mongoose = require('mongoose');
  mongoose.set('strictQuery', false);
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 30000, socketTimeoutMS: 30000, connectTimeoutMS: 30000 });
  mongoCol = mongoose.connection.db.collection('faka_main');
  mongoReady = true;
  console.log('[db] MongoDB 已连接');
}

async function loadFromMongo() {
  const doc = await mongoCol.findOne({ _id: 'main' });
  if (doc && doc.data) {
    db = doc.data;
    // 结构完整性校验
    const base = emptyDb();
    for (const key of Object.keys(base)) {
      if (!(key in db)) db[key] = base[key];
    }
  } else {
    db = emptyDb();
  }
  return db;
}

async function saveToMongo() {
  if (!mongoReady || !db) return;
  await mongoCol.updateOne(
    { _id: 'main' },
    { $set: { data: db, updatedAt: new Date() } },
    { upsert: true }
  );
}

/* ================= 本地 JSON 模式 ================= */

function loadFromFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(raw);
      const base = emptyDb();
      for (const key of Object.keys(base)) {
        if (!(key in db)) db[key] = base[key];
      }
    } catch (e) {
      try { fs.renameSync(DB_FILE, DB_FILE + '.corrupt-' + Date.now()); } catch (e2) { /* ignore */ }
      db = emptyDb();
    }
  } else {
    db = emptyDb();
  }
  return db;
}

function saveToFile() {
  try {
    const json = JSON.stringify(db, null, 2);
    fs.writeFileSync(TMP_FILE, json, 'utf8');
    fs.renameSync(TMP_FILE, DB_FILE);
  } catch (e) {
    console.error('[db] 保存失败:', e.message);
  }
}

/* ================= 统一接口 ================= */

/** 初始化（异步，云模式需等待 MongoDB 连接） */
async function init() {
  if (db) return db;
  if (USE_MONGO) {
    await connectMongo();
    await loadFromMongo();
  } else {
    loadFromFile();
  }
  return db;
}

/** 获取内存数据（init 之后调用） */
function load() {
  if (db) return db;
  // 兼容旧代码：未 init 时同步加载（仅本地模式）
  if (!USE_MONGO) return loadFromFile();
  throw new Error('数据库未初始化，请先调用 db.init()');
}

/** 保存（标记脏数据；Mongo 立即在后台串行写入，本地文件保留防抖）。关键写操作仍应 await flushNow() */
function save(force) {
  if (!db) return;
  dirty = true;
  if (USE_MONGO) {
    // Vercel 等 Serverless：响应返回后实例很快被冻结/回收，防抖 timer 经常来不及执行，
    // 导致"操作提示成功但数据没落库"。这里立即把写操作串行入队（响应返回前就开始网络写），
    // 最终由 flushNow() 在响应前 await 兜底确认。
    scheduleMongoWrite();
    return;
  }
  if (force && saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { saveToFile(); dirty = false; } catch (e) { console.error('[db] 保存失败:', e.message); }
  }, force ? 0 : 150);
}

// Mongo 写入串行链：同一时刻仅一个全量写，后一个写包含前一个写的全部变更，杜绝并发覆盖
let writeChain = Promise.resolve();
function scheduleMongoWrite() {
  const run = writeChain.then(() => saveToMongo());
  writeChain = run.catch((e) => console.error('[db] MongoDB 保存失败:', e.message));
  return run;
}

/** 执行变更并标记保存 */
function mutate(fn) {
  const d = load();
  const result = fn(d);
  save(false);
  return result;
}

/** 下一个自增 ID */
function nextId(entity) {
  const d = load();
  d.seq[entity] = (d.seq[entity] || 0) + 1;
  return d.seq[entity];
}

/** 立即落盘（响应前调用：等待在途写入完成并确认本次数据已持久化，然后清脏标志） */
async function flushNow() {
  if (!db || !dirty) return;
  if (USE_MONGO) {
    try { await scheduleMongoWrite(); dirty = false; }
    catch (e) { console.error('[db] flushNow失败:', e.message); }
  } else {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    try { saveToFile(); dirty = false; } catch (e) { console.error('[db] flushNow失败:', e.message); }
  }
}

/** 重新加载（先等待在途写入落库，再从存储读最新；Serverless 每请求调用以避免热实例旧快照） */
async function reload() {
  try { await writeChain; } catch (e) { /* 忽略 */ }
  db = null;
  return await init();
}

/** 用种子数据覆盖（首次启动初始化） */
async function seed(data) {
  db = data;
  if (USE_MONGO) {
    await saveToMongo();
  } else {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    saveToFile();
  }
}

process.on('exit', () => { if (!USE_MONGO) flushNow(); });
process.on('SIGINT', () => { flushNow(); process.exit(0); });

module.exports = {
  init, load, save, mutate, nextId, flushNow, reload, seed,
  DB_FILE, emptyDb, USE_MONGO
};
