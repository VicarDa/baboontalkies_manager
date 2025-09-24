#!/usr/bin/env node

import { YuekebaoGrabberServer } from './src/index.js';

async function testScraping() {
  console.log('开始登录约课宝并抓取课程数据...\n');

  const server = new YuekebaoGrabberServer();

  try {
    // Simulate an MCP tool call
    const result = await server.scrapeYuekebaoCourses({
      email: '3kkg7a7k4d66@qq.com',
      password: 'flyegg',
      headless: false, // Keep browser open for debugging
      timeout: 30000
    });

    console.log('测试完成！');
    console.log('结果:', result);

  } catch (error) {
    console.error('测试失败:', error);
  }
}

testScraping();