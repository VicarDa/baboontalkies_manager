#!/usr/bin/env node

// BaboonTalkies Manager container entrypoint.
import { loadLocalEnv } from './src/load-env.js';

async function main() {
  await loadLocalEnv();
  console.log('启动约课宝管理系统...');

  const { YuekebaoGrabberServer } = await import('./src/index.js');
  const serverInstance = new YuekebaoGrabberServer();
  const port = process.env.PORT || 9000;

  await serverInstance.startDashboard(port, false);

  console.log(`服务启动成功，监听端口 ${port}`);
  console.log(`访问地址: http://localhost:${port}`);
}

main().catch(error => {
  console.error('启动失败:', error);
  process.exit(1);
});
