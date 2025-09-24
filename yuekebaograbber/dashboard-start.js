#!/usr/bin/env node

import { YuekebaoGrabberServer } from './src/index.js';

async function startDashboard() {
  console.log('启动约课宝仪表板服务...\n');

  const server = new YuekebaoGrabberServer();

  try {
    await server.runWithDashboard(process.env.PORT || 3000);
  } catch (error) {
    console.error('启动仪表板失败:', error);
    process.exit(1);
  }
}

startDashboard();