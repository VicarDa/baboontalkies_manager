#!/usr/bin/env node

// 阿里云函数计算入口文件
// 适配 Function Compute HTTP 触发器
import { YuekebaoGrabberServer } from './src/index.js';

let serverInstance = null;
let isInitialized = false;

// 初始化服务器实例（只初始化一次）
async function initialize() {
  if (!isInitialized) {
    console.log('🚀 正在初始化约课宝服务器...');
    serverInstance = new YuekebaoGrabberServer();

    // 启动 Dashboard Web 服务器
    // 注意：在云函数环境中，端口由环境变量 FC_SERVER_PORT 指定
    const port = process.env.FC_SERVER_PORT || process.env.PORT || 9000;
    const useHttps = false; // 云函数环境使用 HTTP

    await serverInstance.runWithDashboard(port, useHttps);
    isInitialized = true;
    console.log('✅ 服务器初始化完成');
  }
  return serverInstance;
}

// 阿里云函数计算入口 - 支持 HTTP 触发器和定时触发器
export const handler = async (req, resp, context) => {
  try {
    // 确保服务器已初始化
    await initialize();

    // 🐛 调试: 打印 req 对象信息
    console.log('🔍 DEBUG - Handler 被调用');
    console.log('🔍 DEBUG - req 对象类型:', typeof req);
    console.log('🔍 DEBUG - req.triggerName:', req?.triggerName);
    console.log('🔍 DEBUG - req keys:', req ? Object.keys(req).join(', ') : 'null');
    console.log('🔍 DEBUG - context.requestId:', context?.requestId);

    // 检测触发器类型
    // 定时触发器的 req 参数会包含 triggerName
    if (req && req.triggerName === 'autoScraper') {
      const now = new Date();
      const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
      const timeString = beijingTime.toISOString().replace('T', ' ').substring(0, 19);

      console.log('='.repeat(60));
      console.log('⏰ 定时触发器触发 - 开始自动抓取数据');
      console.log('🕐 当前时间(北京时间):', timeString);
      console.log('📋 触发器时间:', req.triggerTime);
      console.log('📦 Payload:', req.payload);
      console.log('='.repeat(60));

      try {
        const startTime = Date.now();

        // 调用数据抓取方法
        const result = await serverInstance.scrapeYuekebaoCourses({
          email: process.env.YUEKEBAO_EMAIL || '3kkg7a7k4d66@qq.com',
          password: process.env.YUEKEBAO_PASSWORD || 'flyegg'
        });

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        console.log('='.repeat(60));
        console.log('✅ 定时抓取完成');
        console.log('⏱️  执行耗时:', duration, '秒');
        console.log('🕐 完成时间(北京时间):', new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19));
        console.log('📊 抓取结果:', JSON.stringify(result, null, 2));
        console.log('='.repeat(60));

        // 定时触发器需要返回响应
        if (resp && typeof resp.send === 'function') {
          resp.setStatusCode(200);
          resp.setHeader('Content-Type', 'application/json');
          resp.send(JSON.stringify({
            success: true,
            message: '定时抓取完成',
            timestamp: new Date().toISOString(),
            triggerTime: req.triggerTime,
            result: result
          }));
        }

        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            message: '定时抓取完成',
            result: result
          })
        };
      } catch (scrapeError) {
        console.log('='.repeat(60));
        console.error('❌ 定时抓取失败');
        console.error('🕐 失败时间(北京时间):', new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19));
        console.error('💥 错误信息:', scrapeError.message);
        console.error('📋 错误堆栈:', scrapeError.stack);
        console.log('='.repeat(60));

        if (resp && typeof resp.send === 'function') {
          resp.setStatusCode(500);
          resp.setHeader('Content-Type', 'application/json');
          resp.send(JSON.stringify({
            success: false,
            error: scrapeError.message,
            stack: scrapeError.stack
          }));
        }

        return {
          statusCode: 500,
          body: JSON.stringify({
            success: false,
            error: scrapeError.message
          })
        };
      }
    }

    // HTTP 触发器处理
    // 由于我们使用 Express，这里只需要确保服务器在运行
    // Express 会处理所有的 HTTP 请求
    if (resp && typeof resp.send === 'function') {
      resp.setStatusCode(200);
      resp.setHeader('Content-Type', 'application/json');
      resp.send(JSON.stringify({
        message: 'Function is running. Please access the dashboard through the function URL.',
        status: 'ok',
        timestamp: new Date().toISOString()
      }));
    }
  } catch (error) {
    console.error('❌ 函数执行错误:', error);
    if (resp && typeof resp.send === 'function') {
      resp.setStatusCode(500);
      resp.setHeader('Content-Type', 'application/json');
      resp.send(JSON.stringify({
        error: error.message,
        stack: error.stack
      }));
    }
  }
};

// 自动启动 Dashboard (本地开发或云函数环境)
// 注意:云函数需要立即监听端口,否则健康检查失败
initialize().catch(error => {
  console.error('❌ 启动失败:', error);
  process.exit(1);
});
