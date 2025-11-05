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

// 阿里云函数计算 HTTP 触发器入口
export const handler = async (req, resp, context) => {
  try {
    // 确保服务器已初始化
    await initialize();

    // 由于我们使用 Express，这里只需要确保服务器在运行
    // Express 会处理所有的 HTTP 请求

    resp.setStatusCode(200);
    resp.setHeader('Content-Type', 'application/json');
    resp.send(JSON.stringify({
      message: 'Function is running. Please access the dashboard through the function URL.',
      status: 'ok',
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    console.error('❌ 函数执行错误:', error);
    resp.setStatusCode(500);
    resp.setHeader('Content-Type', 'application/json');
    resp.send(JSON.stringify({
      error: error.message,
      stack: error.stack
    }));
  }
};

// 自动启动 Dashboard (本地开发或云函数环境)
// 注意:云函数需要立即监听端口,否则健康检查失败
initialize().catch(error => {
  console.error('❌ 启动失败:', error);
  process.exit(1);
});
