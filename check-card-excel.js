#!/usr/bin/env node

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

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
console.log(`\n📊 检查最新会员卡Excel文件: ${latestFile}`);
console.log(`📁 文件大小: ${(files[0].stat.size / 1024).toFixed(2)} KB`);
console.log(`📅 修改时间: ${files[0].stat.mtime.toLocaleString()}\n`);

try {
  // Read the Excel file
  const workbook = XLSX.readFile(latestFile);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON
  const data = XLSX.utils.sheet_to_json(worksheet);

  console.log(`📋 工作表名称: ${sheetName}`);
  console.log(`📊 总行数: ${data.length}`);

  if (data.length > 0) {
    console.log(`\n🔍 列名:`)
    const columns = Object.keys(data[0]);
    columns.forEach((col, i) => {
      console.log(`  ${i + 1}. ${col}`);
    });

    console.log(`\n📄 前5行数据:`);
    data.slice(0, 5).forEach((row, i) => {
      console.log(`\n--- 第${i + 1}行 ---`);
      Object.entries(row).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
    });

    // Statistics
    console.log(`\n📈 数据统计:`);
    const courseTypes = [...new Set(data.map(row => row['课程类型']).filter(type => type))];
    console.log(`  课程类型种类: ${courseTypes.length}`);
    courseTypes.forEach(type => {
      const count = data.filter(row => row['课程类型'] === type).length;
      console.log(`    - ${type}: ${count} 人`);
    });

    const totalRemaining = data.reduce((sum, row) => sum + (parseInt(row['剩余课时数']) || 0), 0);
    const totalScheduled = data.reduce((sum, row) => sum + (parseInt(row['剩余已排课数']) || 0), 0);

    console.log(`  总剩余课时数: ${totalRemaining} 次`);
    console.log(`  总已排课数: ${totalScheduled} 次`);

    // Data quality check
    console.log(`\n🔍 数据质量检查:`);
    const emptyNameCount = data.filter(row => !row['学生姓名'] || row['学生姓名'].toString().trim() === '').length;
    const emptyPhoneCount = data.filter(row => !row['学生手机号'] || row['学生手机号'].toString().trim() === '').length;
    const emptyCourseCount = data.filter(row => !row['课程类型'] || row['课程类型'].toString().trim() === '').length;

    console.log(`  空学生姓名: ${emptyNameCount}/${data.length}`);
    console.log(`  空手机号: ${emptyPhoneCount}/${data.length}`);
    console.log(`  空课程类型: ${emptyCourseCount}/${data.length}`);
  }

} catch (error) {
  console.error('读取会员卡Excel文件失败:', error.message);
}