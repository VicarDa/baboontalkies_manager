#!/usr/bin/env node

import { loadLocalEnv } from './src/load-env.js';

async function startDashboard() {
  await loadLocalEnv();
  console.log('启动约课宝仪表板服务...\n');

  const { YuekebaoGrabberServer } = await import('./src/index.js');
  const server = new YuekebaoGrabberServer();
  const port = process.env.PORT || 3000;
  const useHttps = process.env.HTTPS !== 'false'; // 默认启用HTTPS，除非明确设置为false

  try {
    await server.runWithDashboard(port, useHttps);
  } catch (error) {
    console.error('启动仪表板失败:', error);
    process.exit(1);
  }
}

startDashboard();
