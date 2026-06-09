/**
 * MySQL 连接稳定性与延时测试
 * 使用与 src/index.js 相同的 mysql2/promise + createPool 方式
 */
import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: '34.87.145.27',
  port: 3306,
  user: 'dev',
  password: '3.@d?*|X|GLc;0%z',
  database: 'baboon',
  timezone: '+08:00',
  connectTimeout: 5000,
};

const POOL_CONFIG = {
  ...DB_CONFIG,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

// ========== 工具函数 ==========

function now() {
  return performance.now();
}

function stats(arr) {
  if (arr.length === 0) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(avg * 100) / 100,
    p50, p95, p99,
  };
}

// ========== 测试 1: 单次连接延时 ==========
async function testSingleConnection() {
  console.log('\n=== 测试 1: 单次 mysql.createConnection 延时 ===');
  const latencies = [];
  const iterations = 10;

  for (let i = 1; i <= iterations; i++) {
    const start = now();
    const conn = await mysql.createConnection(DB_CONFIG);
    await conn.ping();
    const elapsed = now() - start;
    latencies.push(Math.round(elapsed * 100) / 100);
    await conn.end();
    console.log(`  #${i}: ${latencies[i - 1]}ms`);
  }

  const s = stats(latencies);
  console.log(`  结果: min=${s.min}ms, max=${s.max}ms, avg=${s.avg}ms, p50=${s.p50}ms, p95=${s.p95}ms, p99=${s.p99}ms`);
  return s;
}

// ========== 测试 2: Pool 获取连接延时 ==========
async function testPoolGetConnection() {
  console.log('\n=== 测试 2: Pool.getConnection 延时（模拟生产使用方式）===');
  const pool = mysql.createPool(POOL_CONFIG);
  const latencies = [];
  const iterations = 20;

  for (let i = 1; i <= iterations; i++) {
    const start = now();
    const conn = await pool.getConnection();
    await conn.query(`SET time_zone = '+08:00'`); // 模拟 applyShanghaiTimeZoneToConnection
    await conn.ping();
    const elapsed = now() - start;
    latencies.push(Math.round(elapsed * 100) / 100);
    conn.release();
    console.log(`  #${i}: ${latencies[i - 1]}ms`);
  }

  const s = stats(latencies);
  console.log(`  结果: min=${s.min}ms, max=${s.max}ms, avg=${s.avg}ms, p50=${s.p50}ms, p95=${s.p95}ms, p99=${s.p99}ms`);
  await pool.end();
  return s;
}

// ========== 测试 3: 简单查询延时（SELECT 1）==========
async function testSimpleQuery() {
  console.log('\n=== 测试 3: 简单查询延时（SELECT 1）===');
  const pool = mysql.createPool(POOL_CONFIG);
  const conn = await pool.getConnection();
  await conn.query(`SET time_zone = '+08:00'`);
  const latencies = [];
  const iterations = 50;

  for (let i = 1; i <= iterations; i++) {
    const start = now();
    const [rows] = await conn.query('SELECT 1 AS test');
    const elapsed = now() - start;
    latencies.push(Math.round(elapsed * 100) / 100);
  }
  conn.release();
  await pool.end();

  const s = stats(latencies);
  console.log(`  执行 ${iterations} 次 SELECT 1`);
  console.log(`  结果: min=${s.min}ms, max=${s.max}ms, avg=${s.avg}ms, p50=${s.p50}ms, p95=${s.p95}ms, p99=${s.p99}ms`);
  return s;
}

// ========== 测试 4: 真实业务表查询延时 ==========
async function testRealTableQuery() {
  console.log('\n=== 测试 4: 真实业务表查询延时 ===');
  const pool = mysql.createPool(POOL_CONFIG);
  const conn = await pool.getConnection();
  await conn.query(`SET time_zone = '+08:00'`);

  const queries = [
    { label: 'COUNT(*) yuekebao_classtime', sql: 'SELECT COUNT(*) AS cnt FROM yuekebao_classtime' },
    { label: 'COUNT(*) yuekebao_student_cardnum', sql: 'SELECT COUNT(*) AS cnt FROM yuekebao_student_cardnum' },
    { label: 'COUNT(*) yuekebao_teacher_salary', sql: 'SELECT COUNT(*) AS cnt FROM yuekebao_teacher_salary' },
  ];

  for (const { label, sql } of queries) {
    const latencies = [];
    for (let i = 0; i < 5; i++) {
      const start = now();
      const [rows] = await conn.query(sql);
      const elapsed = now() - start;
      latencies.push(Math.round(elapsed * 100) / 100);
    }
    const s = stats(latencies);
    const [firstCheck] = await conn.query(sql);
    console.log(`  ${label}: ${firstCheck[0].cnt} 条记录`);
    console.log(`    延时 avg=${s.avg}ms, p95=${s.p95}ms, max=${s.max}ms`);
  }

  conn.release();
  await pool.end();
}

// ========== 测试 5: 并发连接压力测试 ==========
async function testConcurrentConnections() {
  console.log('\n=== 测试 5: 并发连接压力测试 ===');
  const pool = mysql.createPool({ ...POOL_CONFIG, connectionLimit: 10 });
  const concurrencyLevels = [5, 10, 20];
  const results = [];

  for (const level of concurrencyLevels) {
    const start = now();
    const promises = [];
    for (let i = 0; i < level; i++) {
      promises.push((async () => {
        const conn = await pool.getConnection();
        await conn.query(`SET time_zone = '+08:00'`);
        await conn.query('SELECT 1');
        conn.release();
      })());
    }
    await Promise.all(promises);
    const totalTime = Math.round((now() - start) * 100) / 100;

    // 再测每个连接获取的延迟
    const connLatencies = [];
    for (let i = 0; i < level; i++) {
      const t = now();
      const conn = await pool.getConnection();
      connLatencies.push(Math.round((now() - t) * 100) / 100);
      conn.release();
    }
    const s = stats(connLatencies);

    console.log(`  并发 ${level}: 全部完成=${totalTime}ms, getConn avg=${s.avg}ms, getConn p95=${s.p95}ms`);
    results.push({ level, totalTime, ...s });
  }

  await pool.end();
  return results;
}

// ========== 测试 6: 持续连接稳定性（长连接 + 定期 ping）==========
async function testConnectionStability() {
  console.log('\n=== 测试 6: 持续连接稳定性（保持连接 60 秒，每 2 秒 ping）===');
  const pool = mysql.createPool(POOL_CONFIG);
  const conn = await pool.getConnection();
  await conn.query(`SET time_zone = '+08:00'`);

  const latencies = [];
  const errors = [];
  const durationSec = 60;
  const intervalMs = 2000;
  const iterations = Math.floor((durationSec * 1000) / intervalMs);

  console.log(`  持续 ${durationSec} 秒，每 ${intervalMs / 1000} 秒一次 ping + SELECT 1...`);

  for (let i = 0; i < iterations; i++) {
    const start = now();
    try {
      await conn.ping();
      await conn.query('SELECT 1');
      const elapsed = Math.round((now() - start) * 100) / 100;
      latencies.push(elapsed);
      process.stdout.write(`  [${String(i + 1).padStart(3)}/${iterations}] ${elapsed}ms\r`);
    } catch (err) {
      errors.push({ iteration: i + 1, error: err.message });
      process.stdout.write(`  [${String(i + 1).padStart(3)}/${iterations}] ERROR: ${err.message}\n`);
    }
    if (i < iterations - 1) {
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }

  console.log(''); // newline

  const s = stats(latencies);
  console.log(`  成功: ${latencies.length}/${iterations}, 失败: ${errors.length}`);
  console.log(`  延时: min=${s.min}ms, max=${s.max}ms, avg=${s.avg}ms, p50=${s.p50}ms, p95=${s.p95}ms, p99=${s.p99}ms`);

  conn.release();
  await pool.end();

  if (errors.length > 0) {
    console.log(`  错误详情:`);
    errors.forEach(e => console.log(`    第${e.iteration}次: ${e.error}`));
  }

  return { latencies, errors };
}

// ========== 测试 7: Pool 重用 vs 新建连接对比 ==========
async function testPoolReuseVsNew() {
  console.log('\n=== 测试 7: Pool 连接重用 vs 每次新建连接 ===');
  const pool = mysql.createPool(POOL_CONFIG);
  const iterations = 20;

  // Pool 重用
  const poolLatencies = [];
  for (let i = 0; i < iterations; i++) {
    const start = now();
    const conn = await pool.getConnection();
    await conn.ping();
    poolLatencies.push(Math.round((now() - start) * 100) / 100);
    conn.release();
  }
  const poolStats = stats(poolLatencies);
  console.log(`  Pool 重用 (${iterations}次): avg=${poolStats.avg}ms, p95=${poolStats.p95}ms`);

  // 每次新建连接
  const newLatencies = [];
  for (let i = 0; i < iterations; i++) {
    const start = now();
    const conn = await mysql.createConnection(DB_CONFIG);
    await conn.ping();
    newLatencies.push(Math.round((now() - start) * 100) / 100);
    await conn.end();
  }
  const newStats = stats(newLatencies);
  console.log(`  每次新建 (${iterations}次): avg=${newStats.avg}ms, p95=${newStats.p95}ms`);

  await pool.end();

  const improvement = Math.round((newStats.avg - poolStats.avg) / newStats.avg * 100);
  console.log(`  Pool 比新建快约 ${improvement}%`);

  return { poolStats, newStats, improvement };
}

// ========== 主入口 ==========
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     MySQL 连接稳定性与延时测试                    ║');
  console.log('║     Host: 34.87.145.27 (Google Cloud SQL)        ║');
  console.log('║     User: dev, Database: baboon                  ║');
  console.log('║     Library: mysql2/promise                      ║');
  console.log('╚══════════════════════════════════════════════════╝');

  const totalStart = now();

  try {
    // 先验证基本连通性
    console.log('\n>>> 验证基本连通性...');
    const testConn = await mysql.createConnection(DB_CONFIG);
    const [version] = await testConn.query('SELECT VERSION() AS v');
    console.log(`  MySQL 版本: ${version[0].v}`);
    const [dbSize] = await testConn.query(
      "SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb FROM information_schema.tables WHERE table_schema = 'baboon'"
    );
    console.log(`  数据库大小: ${dbSize[0].size_mb} MB`);
    await testConn.end();

    // 运行各项测试
    await testSingleConnection();
    await testPoolGetConnection();
    await testSimpleQuery();
    await testRealTableQuery();
    await testConcurrentConnections();
    await testConnectionStability();
    await testPoolReuseVsNew();

  } catch (err) {
    console.error(`\n 测试失败: ${err.message}`);
    console.error(err);
    process.exit(1);
  }

  const totalElapsed = Math.round((now() - totalStart) * 100) / 100;
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  全部测试完成，总耗时: ${(totalElapsed / 1000).toFixed(1)}s`);
  console.log(`═══════════════════════════════════════════════════\n`);
}

main();
