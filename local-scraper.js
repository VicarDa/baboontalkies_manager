#!/usr/bin/env node

/**
 * 本地定时抓取脚本
 *
 * 功能：
 * 1. 每10分钟自动抓取约课宝数据并保存到数据库
 * 2. 提供 HTTP API 接口用于手动触发抓取
 *
 * 使用方法：
 * 1. 设置环境变量：
 *    export YUEKEBAO_EMAIL="3kkg7a7k4d66@qq.com"
 *    export YUEKEBAO_PASSWORD="flyegg"
 *
 * 2. 启动服务：
 *    node local-scraper.js
 *
 * 3. 手动触发抓取：
 *    curl http://localhost:3001/trigger-scrape
 *
 * 4. 查看状态：
 *    curl http://localhost:3001/status
 */

import { YuekebaoGrabberServer } from './src/index.js';
import express from 'express';

const PORT = process.env.SCRAPER_PORT || 18186;
const INTERVAL = 10 * 60 * 1000; // 10分钟

class LocalScraper {
  constructor() {
    this.server = new YuekebaoGrabberServer();
    this.app = express();
    this.isRunning = false;
    this.lastRunTime = null;
    this.lastRunStatus = null;
    this.nextRunTime = null;
    this.scheduledTimer = null;

    this.setupAPI();
  }

  setupAPI() {
    // 健康检查
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', message: '本地抓取服务运行正常' });
    });

    // 状态查询
    this.app.get('/status', (req, res) => {
      const now = new Date();
      res.json({
        status: 'running',
        isScrapingNow: this.isRunning,
        lastRunTime: this.lastRunTime,
        lastRunStatus: this.lastRunStatus,
        nextRunTime: this.nextRunTime,
        currentTime: now.toISOString(),
        intervalMinutes: 10,
        scraperPort: PORT
      });
    });

    // 手动触发抓取
    this.app.post('/trigger-scrape', async (req, res) => {
      if (this.isRunning) {
        return res.status(409).json({
          error: '抓取任务正在进行中，请稍后再试',
          lastRunTime: this.lastRunTime
        });
      }

      // 立即触发抓取（异步执行）
      this.performScraping().catch(err => {
        console.error('❌ 手动触发抓取失败:', err.message);
      });

      res.json({
        message: '抓取任务已触发',
        startTime: new Date().toISOString()
      });
    });

    // GET 方式也支持触发（方便浏览器访问）
    this.app.get('/trigger-scrape', async (req, res) => {
      if (this.isRunning) {
        return res.status(409).json({
          error: '抓取任务正在进行中，请稍后再试',
          lastRunTime: this.lastRunTime
        });
      }

      // 立即触发抓取（异步执行）
      this.performScraping().catch(err => {
        console.error('❌ 手动触发抓取失败:', err.message);
      });

      res.json({
        message: '抓取任务已触发',
        startTime: new Date().toISOString()
      });
    });
  }

  // 执行抓取任务
  async performScraping() {
    if (this.isRunning) {
      console.log('⚠️  抓取任务正在进行中，跳过本次执行');
      return;
    }

    this.isRunning = true;
    const startTime = new Date();

    try {
      console.log('='.repeat(60));
      console.log(`⏰ 开始抓取任务 - ${startTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
      console.log('='.repeat(60));

      await this.server.performScheduledScraping();

      this.lastRunTime = startTime.toISOString();
      this.lastRunStatus = 'success';

      console.log('='.repeat(60));
      console.log(`✅ 抓取任务完成 - 耗时: ${((new Date() - startTime) / 1000).toFixed(2)}秒`);
      console.log('='.repeat(60));
    } catch (error) {
      this.lastRunTime = startTime.toISOString();
      this.lastRunStatus = 'failed';

      console.error('='.repeat(60));
      console.error('❌ 抓取任务失败:', error.message);
      console.error('📋 错误堆栈:', error.stack);
      console.error('='.repeat(60));
    } finally {
      this.isRunning = false;
      this.updateNextRunTime();
    }
  }

  // 更新下次运行时间
  updateNextRunTime() {
    const next = new Date(Date.now() + INTERVAL);
    this.nextRunTime = next.toISOString();
  }

  // 启动定时任务
  async start() {
    console.log('🚀 本地抓取服务启动中...');
    console.log(`📍 API 服务端口: ${PORT}`);
    console.log(`⏱️  抓取间隔: 10分钟`);
    console.log(`📧 登录账号: ${process.env.YUEKEBAO_EMAIL || '未设置'}`);

    // 检查环境变量
    if (!process.env.YUEKEBAO_EMAIL || !process.env.YUEKEBAO_PASSWORD) {
      console.error('❌ 错误: 未设置环境变量 YUEKEBAO_EMAIL 和 YUEKEBAO_PASSWORD');
      console.error('请设置环境变量后重试：');
      console.error('  export YUEKEBAO_EMAIL="3kkg7a7k4d66@qq.com"');
      console.error('  export YUEKEBAO_PASSWORD="flyegg"');
      process.exit(1);
    }

    // 启动 API 服务器
    this.app.listen(PORT, () => {
      console.log(`✅ API 服务已启动: http://localhost:${PORT}`);
      console.log(`📖 可用接口：`);
      console.log(`   - GET  /health          健康检查`);
      console.log(`   - GET  /status          查看状态`);
      console.log(`   - GET  /trigger-scrape  手动触发抓取`);
      console.log(`   - POST /trigger-scrape  手动触发抓取`);
    });

    // 立即执行首次抓取
    console.log('\n🚀 执行首次自动抓取...\n');
    await this.performScraping();

    // 设置定时任务（每10分钟）
    this.scheduledTimer = setInterval(async () => {
      await this.performScraping();
    }, INTERVAL);

    this.updateNextRunTime();
    console.log(`\n✅ 定时器已设置 - 下次抓取时间: ${new Date(this.nextRunTime).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`);

    // 优雅退出
    process.on('SIGINT', () => {
      console.log('\n\n正在关闭服务...');
      if (this.scheduledTimer) {
        clearInterval(this.scheduledTimer);
        console.log('✅ 定时器已停止');
      }
      console.log('👋 服务已关闭');
      process.exit(0);
    });
  }
}

// 启动服务
const scraper = new LocalScraper();
scraper.start();
