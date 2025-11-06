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

    // 检测触发器类型
    // 定时触发器的 req 参数会包含 triggerName
    if (req && req.triggerName === 'autoScraper') {
      console.log('⏰ 定时触发器触发 - 开始自动抓取数据');
      console.log('📋 触发时间:', req.triggerTime);
      console.log('📦 Payload:', req.payload);

      try {
        // 调用数据抓取方法
        const result = await serverInstance.scrapeYuekebaoCourses({
          email: process.env.YUEKEBAO_EMAIL || '3kkg7a7k4d66@qq.com',
          password: process.env.YUEKEBAO_PASSWORD || 'flyegg'
        });

        console.log('✅ 定时抓取完成');
        console.log('📊 抓取结果:', JSON.stringify(result, null, 2));

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
        console.error('❌ 定时抓取失败:', scrapeError);

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
