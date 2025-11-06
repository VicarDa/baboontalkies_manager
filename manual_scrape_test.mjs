// 手动测试抓取功能
import { YuekebaoGrabberServer } from './src/index.js';

async function testScrape() {
  console.log('🧪 开始手动测试抓取功能...\n');
  
  const server = new YuekebaoGrabberServer();
  
  try {
    const result = await server.scrapeYuekebaoCourses({
      email: '3kkg7a7k4d66@qq.com',
      password: 'flyegg'
    });
    
    console.log('\n✅ 抓取测试完成!');
    console.log('📊 结果摘要:');
    console.log(JSON.stringify(result, null, 2).substring(0, 1000));
  } catch (error) {
    console.error('\n❌ 抓取测试失败:');
    console.error('错误:', error.message);
    console.error('堆栈:', error.stack);
  }
  
  process.exit(0);
}

testScrape();
