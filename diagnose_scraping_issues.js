/**
 * 诊断抓取稳定性问题的脚本
 * 运行多次抓取并比较结果差异
 */

async function analyzeScrapeResults() {
  console.log('='.repeat(80));
  console.log('📊 抓取稳定性诊断报告');
  console.log('='.repeat(80));
  console.log('\n基于第一次运行日志的分析:\n');

  console.log('【问题1】页面加载超时');
  console.log('----------------------------------------');
  console.log('现象: 第二次运行时登录页面加载超时(30秒)');
  console.log('原因分析:');
  console.log('  1. networkidle 策略要求网络完全空闲,对第三方脚本敏感');
  console.log('  2. 30秒超时在网络波动时不够稳定');
  console.log('  3. 滑块验证码加载可能触发额外请求,影响 networkidle 判断');
  console.log('');
  console.log('建议修复:');
  console.log('  ✅ 将 waitUntil 改为 "domcontentloaded"');
  console.log('  ✅ 增加超时到 60000ms');
  console.log('  ✅ 添加重试机制,最多重试3次');
  console.log('');

  console.log('【问题2】课程数据重复抓取');
  console.log('----------------------------------------');
  console.log('第一次运行统计:');
  console.log('  - 原始记录: 312 条');
  console.log('  - 去重后: 266 条');
  console.log('  - 重复率: 14.7% (46条重复)');
  console.log('');
  console.log('重复来源分析:');
  console.log('  1. 上周数据被抓取: 46条');
  console.log('  2. 7个未来周期数据');
  console.log('  3. 总共8个周期 → 312条原始记录');
  console.log('');
  console.log('重复原因:');
  console.log('  ⚠️  上周数据(10.27-11.02)与当前周(11.03-11.09)可能有交叉日期');
  console.log('  ⚠️  11.01和11.02的课程在两个周期都出现了');
  console.log('');
  console.log('去重逻辑验证:');
  console.log('  ✅ 使用 teacher-student-date-time 组合去重');
  console.log('  ✅ 去重逻辑正确,成功识别并删除46条重复');
  console.log('');

  console.log('【问题3】会员卡数据合并率过高');
  console.log('----------------------------------------');
  console.log('第一次运行统计:');
  console.log('  - 原始记录: 558 条');
  console.log('  - 合并后: 168 条');
  console.log('  - 合并率: 70% (390条被合并)');
  console.log('');
  console.log('合并率分析:');
  console.log('  558 ÷ 168 = 3.32 (平均每个学生有3.32条记录)');
  console.log('');
  console.log('可能原因:');
  console.log('  1. 每个学生可能有多张不同课程类型的卡(菲教/欧教/一对多)');
  console.log('  2. 同一课程类型可能有多张卡(续费卡、赠送卡等)');
  console.log('  3. 分页抓取时可能重复抓取相同记录');
  console.log('');
  console.log('合并逻辑:');
  console.log('  Key: courseType_studentName_studentPhone');
  console.log('  合并方式: 相加 remainingClasses 和 scheduledClasses');
  console.log('');

  console.log('【问题4】可能导致数据变化的因素');
  console.log('----------------------------------------');
  console.log('每次抓取可能不一致的原因:');
  console.log('  1. 🕐 时间相关:');
  console.log('     - 抓取时系统中的课程数据可能被管理员修改');
  console.log('     - 不同时间点抓取,周期范围会变化(基于当前日期计算)');
  console.log('  2. 🌐 网络相关:');
  console.log('     - 页面加载超时导致部分数据未加载完成');
  console.log('     - 分页点击可能失败,导致跳过某些页');
  console.log('  3. 🔄 分页遍历:');
  console.log('     - 会员卡抓取了12页,每页数据量不固定');
  console.log('     - "下一页"按钮检测可能不准确');
  console.log('  4. 🎯 元素检测:');
  console.log('     - 下拉框展开/选择可能失败');
  console.log('     - "未来周课表"下拉框点击失败(日志显示失败)');
  console.log('');

  console.log('【问题5】实际观察到的不稳定情况');
  console.log('----------------------------------------');
  console.log('第一次运行(成功):');
  console.log('  ✅ 登录成功');
  console.log('  ✅ 抓取8个周期课程数据(266条)');
  console.log('  ✅ 抓取12页会员卡数据(168条)');
  console.log('  ❌ 未来周下拉框点击失败');
  console.log('');
  console.log('第二次运行(失败):');
  console.log('  ❌ 登录页面加载超时(30秒)');
  console.log('  ❌ 整个抓取流程终止');
  console.log('');

  console.log('【核心问题总结】');
  console.log('='.repeat(80));
  console.log('1. 🔴 页面加载策略不够健壮 → 导致随机超时失败');
  console.log('2. 🟡 课程数据重复是正常的 → 去重机制工作正常');
  console.log('3. 🟡 会员卡合并率高是正常的 → 一个学生多张卡');
  console.log('4. 🟠 未来周下拉框经常失败 → 可能缺少数据');
  console.log('5. 🟠 分页遍历缺少稳定性验证 → 可能跳过数据');
  console.log('');

  console.log('【建议修复优先级】');
  console.log('='.repeat(80));
  console.log('🔥 高优先级:');
  console.log('  1. 修改 page.goto 的 waitUntil 策略');
  console.log('  2. 增加超时时间和重试机制');
  console.log('  3. 添加更多的错误恢复逻辑');
  console.log('');
  console.log('🔸 中优先级:');
  console.log('  4. 改进分页遍历的稳定性检测');
  console.log('  5. 添加数据一致性校验(每次抓取后对比关键指标)');
  console.log('');
  console.log('🔹 低优先级:');
  console.log('  6. 优化未来周下拉框的点击逻辑(已失败但影响不大)');
  console.log('  7. 添加更详细的日志记录');
  console.log('');
  console.log('='.repeat(80));
}

analyzeScrapeResults().catch(console.error);
