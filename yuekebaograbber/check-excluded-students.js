#!/usr/bin/env node

import XLSX from 'xlsx';
import fs from 'fs';

// Find the latest member card Excel file
const files = fs.readdirSync('.')
  .filter(file => file.endsWith('.xlsx') && file.includes('会员卡') && !file.startsWith('.'))
  .map(file => ({
    name: file,
    stat: fs.statSync(file)
  }))
  .sort((a, b) => b.stat.mtime - a.stat.mtime);

if (files.length === 0) {
  console.log('No member card Excel files found');
  process.exit(1);
}

const latestFile = files[0].name;
console.log(`检查Excel文件中是否包含需排除的学生: ${latestFile}\n`);

try {
  // Read the Excel file
  const workbook = XLSX.readFile(latestFile);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);

  const excludedStudents = ['李思敏', 'nala', '胖达', '沈沐兮 Scarlett'];

  console.log('🔍 检查排除学生:');
  excludedStudents.forEach(excludedName => {
    const found = data.filter(row => row['学生姓名'] && row['学生姓名'].toString().includes(excludedName));
    if (found.length > 0) {
      console.log(`❌ 发现应排除的学生 ${excludedName}: ${found.length} 条记录`);
      found.forEach(record => {
        console.log(`  - ${record['学生姓名']} | ${record['课程类型']}`);
      });
    } else {
      console.log(`✅ 学生 ${excludedName}: 已成功排除`);
    }
  });

  console.log(`\n📊 数据清洗效果：`);
  console.log(`  记录总数: ${data.length}`);
  console.log(`  课程类型分布:`);
  const typeStats = {};
  data.forEach(row => {
    const type = row['课程类型'];
    typeStats[type] = (typeStats[type] || 0) + 1;
  });
  Object.entries(typeStats).forEach(([type, count]) => {
    console.log(`    ${type}: ${count} 人`);
  });

  // 检查试课记录
  const trialClasses = data.filter(row => row['课程类型'] && row['课程类型'].toString().includes('试课'));
  console.log(`\n  试课记录: ${trialClasses.length} 条 ${trialClasses.length > 0 ? '❌ 应该被过滤' : '✅ 已正确过滤'}`);

} catch (error) {
  console.error('读取Excel文件失败:', error.message);
}